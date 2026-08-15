import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { sendPushNotification, isExpiredSubscription } from "@/lib/push";
import { listCanonicalPushSubscriptions } from "@/lib/push-devices";
import {
  pushEndpointHost,
  type ActivityLogInput,
} from "@/lib/activity-log";
import { writeActivityLogs } from "@/lib/write-activity-log";
import { shortDeviceId } from "@/lib/device-id";

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  const subscriptions = await listCanonicalPushSubscriptions(session.id);

  if (subscriptions.length === 0) {
    await writeActivityLogs([
      {
        kind: "PUSH_TEST",
        success: false,
        userId: session.id,
        username: session.username,
        displayName: session.displayName,
        message: "Test push skipped — no active devices",
        error: "No active push subscriptions. Enable notifications first.",
        meta: { source: "user-test" },
      },
    ]);
    return errorResponse("No active push subscriptions. Enable notifications first.", 400);
  }

  let successCount = 0;
  let lastError: string | null = null;
  const logs: ActivityLogInput[] = [];
  const results: Array<{
    subscriptionId: string;
    deviceId: string | null;
    deviceLabel: string | null;
    platform: string | null;
    success: boolean;
    error?: string;
    statusCode?: number;
    deactivated?: boolean;
    latencyMs: number;
    endpointHost: string | null;
  }> = [];
  const targetAt = new Date().toISOString();
  for (const sub of subscriptions) {
    const started = Date.now();
    const result = await sendPushNotification(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      {
        title: "✅ Test Notification",
        body: `${session.displayName}, rally notifications are working.`,
        rallyId: "test",
        notificationType: "TEST",
        targetAt,
      },
      {
        source: "user-test",
        userId: session.id,
        username: session.username,
        displayName: session.displayName,
        subscriptionId: sub.id,
        deviceId: sub.deviceId,
        platform: sub.platform,
      }
    );
    const latencyMs = Date.now() - started;
    const deactivated =
      !result.success &&
      (isExpiredSubscription(result.statusCode) || result.statusCode === 401);

    if (result.success) {
      successCount++;
    } else {
      lastError = result.error || lastError;
      if (deactivated) {
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { active: false },
        });
      }
    }

    results.push({
      subscriptionId: sub.id,
      deviceId: sub.deviceId,
      deviceLabel: shortDeviceId(sub.deviceId),
      platform: sub.platform,
      success: result.success,
      error: result.error,
      statusCode: result.statusCode,
      deactivated,
      latencyMs,
      endpointHost: pushEndpointHost(sub.endpoint),
    });

    logs.push({
      kind: "PUSH_TEST",
      success: result.success,
      userId: session.id,
      username: session.username,
      displayName: session.displayName,
      deviceId: sub.deviceId,
      subscriptionId: sub.id,
      platform: sub.platform,
      message: result.success
        ? `Test push accepted for ${sub.platform || "device"} (${latencyMs}ms)`
        : `Test push failed for ${sub.platform || "device"}`,
      error: result.error,
      meta: {
        source: "user-test",
        statusCode: result.statusCode ?? null,
        dispatchId: result.dispatchId ?? null,
        providerMessageId: result.providerMessageId ?? null,
        latencyMs,
        endpointHost: pushEndpointHost(sub.endpoint),
        deactivated,
      },
    });
  }

  await writeActivityLogs(logs);

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

  return jsonResponse({
    success: true,
    devicesNotified: successCount,
    devicesTested: subscriptions.length,
    results,
  });
}
