import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { rateLimit, RATE_LIMITS, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getVapidPublicKey } from "@/lib/push";

export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return errorResponse("Push notifications not configured", 503);
  }
  return jsonResponse({ publicKey });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(`push-subscribe:${ip}`, RATE_LIMITS.pushSubscribe);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  let body: {
    userId?: string;
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string;
    platform?: string;
    rallyId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { userId, endpoint, keys, userAgent, platform, rallyId } = body;

  if (!userId || !endpoint || !keys?.p256dh || !keys?.auth) {
    return errorResponse("userId, endpoint, and keys (p256dh, auth) are required");
  }

  if (rallyId && !isValidUuid(rallyId)) {
    return errorResponse("Invalid rally ID");
  }

  if (rallyId) {
    const rally = await prisma.rally.findUnique({ where: { id: rallyId } });
    if (!rally) return errorResponse("Rally not found", 404);
    if (rally.cancelled) return errorResponse("Cannot subscribe to a cancelled rally", 400);
  }

  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent || null,
      platform: platform || null,
      active: true,
    },
    update: {
      userId,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent || null,
      platform: platform || null,
      active: true,
    },
  });

  logger.pushSubscriptionCreated(subscription.id, userId);

  if (rallyId) {
    await prisma.rallySubscriber.upsert({
      where: {
        rallyId_pushSubscriptionId: {
          rallyId,
          pushSubscriptionId: subscription.id,
        },
      },
      create: {
        rallyId,
        pushSubscriptionId: subscription.id,
      },
      update: {},
    });
  }

  return jsonResponse({
    success: true,
    subscriptionId: subscription.id,
    active: subscription.active,
  });
}
