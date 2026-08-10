import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { isDeveloperRole } from "@/lib/roles";
import { sendPushNotification, isExpiredSubscription } from "@/lib/push";

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

export async function POST(request: NextRequest) {
  const session = await requireDeveloperFresh(request);
  if (session instanceof Response) return session;

  let body: { subscriptionId?: string; userId?: string; all?: boolean };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  let where: { active: true; id?: string; userId?: string } | null = null;
  if (body.all) {
    where = { active: true };
  } else if (body.subscriptionId && isValidUuid(body.subscriptionId)) {
    where = { id: body.subscriptionId, active: true };
  } else if (body.userId && isValidUuid(body.userId)) {
    where = { userId: body.userId, active: true };
  }

  if (!where) {
    return errorResponse("subscriptionId, userId, or all:true required");
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where,
    include: {
      user: { select: { displayName: true, username: true } },
    },
  });

  if (subscriptions.length === 0) {
    return errorResponse("No active devices found", 404);
  }

  let successCount = 0;
  const results: Array<{
    subscriptionId: string;
    platform: string | null;
    user: string;
    success: boolean;
    error?: string;
  }> = [];

  const targetAt = new Date().toISOString();

  // Fan out in parallel — important when testing many devices at once.
  await Promise.all(
    subscriptions.map(async (sub) => {
      const result = await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        {
          title: "Developer Test",
          body: `${sub.user.displayName} — ${sub.platform || "device"} notification check`,
          rallyId: "developer-test",
          notificationType: "TEST",
          targetAt,
        }
      );

      if (result.success) {
        successCount++;
      } else if (isExpiredSubscription(result.statusCode) || result.statusCode === 401) {
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { active: false },
        });
      }

      results.push({
        subscriptionId: sub.id,
        platform: sub.platform,
        user: sub.user.displayName,
        success: result.success,
        error: result.error,
      });
    })
  );

  return jsonResponse({
    success: successCount > 0,
    devicesTested: subscriptions.length,
    devicesNotified: successCount,
    results,
  });
}
