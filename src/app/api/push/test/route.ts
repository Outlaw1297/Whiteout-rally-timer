import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { sendPushNotification, isExpiredSubscription } from "@/lib/push";

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: session.id, active: true },
  });

  if (subscriptions.length === 0) {
    return errorResponse("No active push subscriptions. Enable notifications first.", 400);
  }

  let successCount = 0;
  let lastError: string | null = null;
  for (const sub of subscriptions) {
    const result = await sendPushNotification(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      {
        title: "✅ Test Notification",
        body: `${session.displayName}, rally notifications are working.`,
        rallyId: "test",
        notificationType: "TEST",
      }
    );

    if (result.success) {
      successCount++;
    } else {
      lastError = result.error || lastError;
      if (isExpiredSubscription(result.statusCode)) {
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { active: false },
        });
      }
    }
  }

  if (successCount === 0) {
    return errorResponse(lastError || "Failed to send test notification", 500);
  }

  return jsonResponse({ success: true, devicesNotified: successCount });
}
