import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { rateLimit, RATE_LIMITS, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getVapidPublicKey, getVapidDiagnostics, initWebPush } from "@/lib/push";

export async function GET() {
  const publicKey = await getVapidPublicKey();
  if (!publicKey) {
    const diagnostics = await getVapidDiagnostics();
    return errorResponse(
      diagnostics.error || "Push notifications not configured",
      503
    );
  }
  return jsonResponse({ publicKey });
}

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  const ip = getClientIp(request);
  const limit = rateLimit(`push-subscribe:${ip}`, RATE_LIMITS.pushSubscribe);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string;
    platform?: string;
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { endpoint, keys, userAgent, platform } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return errorResponse("endpoint and keys (p256dh, auth) are required");
  }

  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: session.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent || null,
      platform: platform || null,
      active: true,
    },
    update: {
      userId: session.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent || null,
      platform: platform || null,
      active: true,
    },
  });

  logger.pushSubscriptionCreated(subscription.id, session.id);

  return jsonResponse({
    success: true,
    subscriptionId: subscription.id,
    active: subscription.active,
  });
}
