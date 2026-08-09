import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { rateLimit, RATE_LIMITS, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(`push-subscribe:${ip}`, RATE_LIMITS.pushSubscribe);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  let body: { endpoint?: string; rallyId?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { endpoint, rallyId } = body;
  if (!endpoint) return errorResponse("endpoint is required");

  const subscription = await prisma.pushSubscription.findUnique({
    where: { endpoint },
  });

  if (!subscription) {
    return errorResponse("Subscription not found", 404);
  }

  if (rallyId) {
    await prisma.rallySubscriber.deleteMany({
      where: {
        rallyId,
        pushSubscriptionId: subscription.id,
      },
    });
  } else {
    await prisma.pushSubscription.update({
      where: { endpoint },
      data: { active: false },
    });
    logger.pushSubscriptionRemoved(subscription.id, "unsubscribed");
  }

  return jsonResponse({ success: true });
}
