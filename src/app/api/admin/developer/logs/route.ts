import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { isDeveloperRole } from "@/lib/roles";
import {
  activityKindGroup,
  activityKindLabel,
  isActivityGroup,
  isActivityKind,
  kindsForGroup,
} from "@/lib/activity-log";
import { shortDeviceId } from "@/lib/device-id";

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
  const kindParam = url.searchParams.get("kind");
  const groupParam = url.searchParams.get("group");
  const userIdParam = url.searchParams.get("userId");
  const limitRaw = Number.parseInt(url.searchParams.get("limit") || "80", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 80;

  const where: {
    kind?: string | { in: string[] };
    userId?: string;
  } = {};

  if (kindParam && isActivityKind(kindParam)) {
    where.kind = kindParam;
  } else if (groupParam && isActivityGroup(groupParam)) {
    where.kind = { in: kindsForGroup(groupParam) };
  }
  if (userIdParam && isValidUuid(userIdParam)) {
    where.userId = userIdParam;
  }

  const rows = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return jsonResponse({
    logs: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      kind: row.kind,
      kindLabel: activityKindLabel(row.kind),
      group: activityKindGroup(row.kind),
      success: row.success,
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      deviceId: row.deviceId,
      deviceLabel: shortDeviceId(row.deviceId),
      subscriptionId: row.subscriptionId,
      platform: row.platform,
      message: row.message,
      error: row.error,
      meta: row.meta,
    })),
  });
}
