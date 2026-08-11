import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { sendPushNotification, isExpiredSubscription } from "@/lib/push";
import { sanitizeNotificationText } from "@/lib/push-text";

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
  const targetAt = new Date().toISOString();
  // Avoid emoji in title — some iOS builds render an empty banner when the title
  // is emoji-prefixed and drop the body.
  const text = sanitizeNotificationText(
    "Test Notification",
    `${session.displayName}, rally notifications are working on this device.`
  );

  for (const sub of subscriptions) {
    const result = await sendPushNotification(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      {
        title: text.title,
        body: text.body,
        rallyId: `test-${Date.now()}`,
        notificationType: "TEST",
        targetAt,
      }
    );

    if (result.success) {
      successCount++;
    } else {
      lastError = result.error || lastError;
      if (isExpiredSubscription(result.statusCode) || result.statusCode === 401) {
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { active: false },
        });
      }
    }
  }

  if (successCount === 0) {
    const needsResubscribe =
      lastError?.includes("Vapid") ||
      lastError?.includes("vapid") ||
      lastError?.includes("401");
    const message = needsResubscribe
      ? `${lastError || "Failed to send test notification"}. Tap Disable then Enable notifications to refresh this device.`
      : lastError || "Failed to send test notification";
    return errorResponse(message, 500);
  }

  return jsonResponse({ success: true, devicesNotified: successCount });
}
