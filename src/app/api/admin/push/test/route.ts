import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sendPushNotification, isExpiredSubscription } from "@/lib/push";

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  let body: { subscriptionId?: string; all?: boolean };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  const where = body.all
    ? { active: true }
    : body.subscriptionId && isValidUuid(body.subscriptionId)
      ? { id: body.subscriptionId, active: true }
      : null;

  if (!where) {
    return errorResponse("subscriptionId or all:true required");
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where,
    include: {
      user: { select: { displayName: true } },
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

  for (const sub of subscriptions) {
    const result = await sendPushNotification(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      {
        title: "🧪 Test Bench",
        body: `${sub.user.displayName} — ${sub.platform || "device"} notification check`,
        rallyId: "test-bench",
        notificationType: "TEST",
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
  }

  return jsonResponse({
    success: successCount > 0,
    devicesTested: subscriptions.length,
    devicesNotified: successCount,
    results,
  });
}
