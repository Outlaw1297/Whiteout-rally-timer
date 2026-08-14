import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { rateLimit, RATE_LIMITS, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { syncUserDeliveryLead } from "@/lib/sync-user-delivery-lead";
import { pushEndpointHost } from "@/lib/activity-log";
import { writeActivityLog } from "@/lib/write-activity-log";

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  const ip = getClientIp(request);
  const limit = rateLimit(`push-subscribe:${ip}`, RATE_LIMITS.pushSubscribe);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  let body: { endpoint?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { endpoint } = body;
  if (!endpoint) return errorResponse("endpoint is required");

  const subscription = await prisma.pushSubscription.findUnique({
    where: { endpoint },
  });

  if (!subscription || subscription.userId !== session.id) {
    return errorResponse("Subscription not found", 404);
  }

  await prisma.pushSubscription.update({
    where: { endpoint },
    data: { active: false },
  });

  logger.pushSubscriptionRemoved(subscription.id, "unsubscribed");

  await writeActivityLog({
    kind: "DEVICE_UNBIND",
    success: true,
    userId: session.id,
    username: session.username,
    displayName: session.displayName,
    deviceId: subscription.deviceId,
    subscriptionId: subscription.id,
    platform: subscription.platform,
    message: `${session.displayName} disabled notifications on this device`,
    meta: { reason: "unsubscribed", endpointHost: pushEndpointHost(endpoint) },
  });

  await syncUserDeliveryLead(session.id);

  return jsonResponse({ success: true });
}
