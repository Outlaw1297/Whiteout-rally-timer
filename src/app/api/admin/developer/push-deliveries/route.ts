import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { errorResponse, jsonResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDeveloperRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

async function requireDeveloperFresh(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;
  const dbUser = await prisma.user.findUnique({
    where: { id: session.id },
    select: { role: true, active: true },
  });
  if (!dbUser?.active || !isDeveloperRole(dbUser.role)) {
    return errorResponse("Forbidden — developer only", 403);
  }
  return session;
}

export async function GET(request: NextRequest) {
  const session = await requireDeveloperFresh(request);
  if (session instanceof Response) return session;

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit")) || 30));
  const hours = Math.min(24 * 30, Math.max(1, Number(url.searchParams.get("hours")) || 24));
  const cursor = url.searchParams.get("cursor") || undefined;
  const query = url.searchParams.get("q")?.trim();
  const outcome = url.searchParams.get("outcome") || "all";
  const platform = url.searchParams.get("platform")?.trim();
  const notificationType = url.searchParams.get("notificationType")?.trim();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const receiptGraceCutoff = new Date(Date.now() - 30_000);
  const displayGraceCutoff = new Date(Date.now() - 10_000);

  const where: Prisma.PushDeliveryAttemptWhereInput = { createdAt: { gte: since } };
  const and: Prisma.PushDeliveryAttemptWhereInput[] = [];

  if (query) {
    and.push({
      OR: [
        { dispatchId: { contains: query, mode: "insensitive" } },
        { userId: { contains: query, mode: "insensitive" } },
        { displayName: { contains: query, mode: "insensitive" } },
        { username: { contains: query, mode: "insensitive" } },
        { deviceId: { contains: query, mode: "insensitive" } },
        { endpointFingerprint: { contains: query, mode: "insensitive" } },
        { notificationType: { contains: query, mode: "insensitive" } },
        { rallyId: { contains: query, mode: "insensitive" } },
      ],
    });
  }
  if (platform) and.push({ platform: { contains: platform, mode: "insensitive" } });
  if (notificationType) and.push({ notificationType });

  if (outcome === "accepted_no_receipt") {
    and.push({
      providerAcceptedAt: { not: null },
      receivedAt: null,
      createdAt: { lte: receiptGraceCutoff },
    });
  } else if (outcome === "received_not_displayed") {
    and.push({
      receivedAt: { not: null, lte: displayGraceCutoff },
      displayedAt: null,
      displayFailedAt: null,
    });
  } else if (outcome === "display_failed") {
    and.push({ displayFailedAt: { not: null } });
  } else if (outcome === "displayed") {
    and.push({ displayedAt: { not: null } });
  } else if (outcome === "provider_failed") {
    and.push({ providerError: { not: null } });
  }
  if (and.length > 0) where.AND = and;

  const rows = await prisma.pushDeliveryAttempt.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const summaryWhere: Prisma.PushDeliveryAttemptWhereInput = { createdAt: { gte: since } };
  const [total, providerAccepted, providerFailed, received, displayed, displayFailed, acceptedNoReceipt] =
    await Promise.all([
      prisma.pushDeliveryAttempt.count({ where: summaryWhere }),
      prisma.pushDeliveryAttempt.count({
        where: { ...summaryWhere, providerAcceptedAt: { not: null } },
      }),
      prisma.pushDeliveryAttempt.count({ where: { ...summaryWhere, providerError: { not: null } } }),
      prisma.pushDeliveryAttempt.count({ where: { ...summaryWhere, receivedAt: { not: null } } }),
      prisma.pushDeliveryAttempt.count({ where: { ...summaryWhere, displayedAt: { not: null } } }),
      prisma.pushDeliveryAttempt.count({
        where: { ...summaryWhere, displayFailedAt: { not: null } },
      }),
      prisma.pushDeliveryAttempt.count({
        where: {
          ...summaryWhere,
          providerAcceptedAt: { not: null },
          receivedAt: null,
          createdAt: { gte: since, lte: receiptGraceCutoff },
        },
      }),
    ]);

  return jsonResponse({
    rows: page.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      providerAcceptedAt: row.providerAcceptedAt?.toISOString() ?? null,
      targetAt: row.targetAt?.toISOString() ?? null,
      receivedAt: row.receivedAt?.toISOString() ?? null,
      clientReceivedAt: row.clientReceivedAt?.toISOString() ?? null,
      calibrationAppliedAt: row.calibrationAppliedAt?.toISOString() ?? null,
      displayedAt: row.displayedAt?.toISOString() ?? null,
      displayFailedAt: row.displayFailedAt?.toISOString() ?? null,
      clickedAt: row.clickedAt?.toISOString() ?? null,
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    summary: {
      hours,
      total,
      providerAccepted,
      providerFailed,
      received,
      displayed,
      displayFailed,
      acceptedNoReceipt,
    },
  });
}
