import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { rateLimit, RATE_LIMITS, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getVapidPublicKey, getVapidDiagnostics } from "@/lib/push";
import { defaultDeliveryLeadMs } from "@/lib/delivery-lead";
import { detectPlatformFromUA } from "@/lib/device-platform";
import { normalizeDeviceId } from "@/lib/device-id";
import { retireDuplicatePushSubscriptions } from "@/lib/push-devices";
import { writeActivityLog } from "@/lib/write-activity-log";

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
    deviceId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { endpoint, keys, userAgent, platform: clientPlatform } = body;
  const deviceId = normalizeDeviceId(body.deviceId);

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return errorResponse("endpoint and keys (p256dh, auth) are required");
  }

  const resolvedUa =
    (typeof userAgent === "string" && userAgent.trim()) ||
    request.headers.get("user-agent") ||
    null;
  const fromUa = resolvedUa ? detectPlatformFromUA(resolvedUa) : null;
  const platform =
    (fromUa && fromUa !== "Unknown" ? fromUa : null) ||
    (typeof clientPlatform === "string" && clientPlatform.trim()) ||
    fromUa ||
    null;

  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
  });
  const sameDevice =
    existing &&
    existing.userId === session.id &&
    ((deviceId && existing.deviceId === deviceId) || existing.endpoint === endpoint);

  const freshLead = defaultDeliveryLeadMs(
    sameDevice ? existing.deliveryLeadMs : undefined,
    platform || resolvedUa
  );

  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: session.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: resolvedUa,
      platform,
      deviceId,
      active: true,
      deliveryLeadMs: freshLead,
      deliverySampleCount: sameDevice ? existing.deliverySampleCount : 0,
      lastSeenAt: new Date(),
    },
    update: {
      userId: session.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: resolvedUa,
      platform,
      deviceId: deviceId ?? undefined,
      active: true,
      lastSeenAt: new Date(),
      ...(sameDevice
        ? {}
        : { deliveryLeadMs: freshLead, deliverySampleCount: 0 }),
    },
  });

  const retired = await retireDuplicatePushSubscriptions({
    userId: session.id,
    keepId: subscription.id,
    deviceId: subscription.deviceId,
    userAgent: subscription.userAgent,
  });

  logger.pushSubscriptionCreated(subscription.id, session.id);

  const isNew = !existing;
  await writeActivityLog({
    kind: "DEVICE_REGISTER",
    success: true,
    userId: session.id,
    username: session.username,
    displayName: session.displayName,
    deviceId: subscription.deviceId,
    subscriptionId: subscription.id,
    platform,
    message: isNew
      ? `${session.displayName} registered ${platform || "a device"}${
          subscription.deviceId ? ` · id ${subscription.deviceId.slice(0, 8)}` : ""
        }`
      : `${session.displayName} re-registered ${platform || "this device"}`,
    meta: {
      created: isNew,
      retiredDuplicates: retired,
      sameDevice,
    },
  });

  if (retired > 0) {
    await writeActivityLog({
      kind: "DEVICE_RETIRE",
      success: true,
      userId: session.id,
      username: session.username,
      displayName: session.displayName,
      deviceId: subscription.deviceId,
      subscriptionId: subscription.id,
      platform,
      message: `Retired ${retired} duplicate endpoint${retired === 1 ? "" : "s"} for this device`,
      meta: { retired },
    });
  }

  await prisma.user.update({
    where: { id: session.id },
    data: {
      lastSeenAt: new Date(),
      ...(sameDevice ? {} : { deliveryLeadMs: freshLead, deliverySampleCount: 0 }),
    },
  });

  return jsonResponse({
    success: true,
    subscriptionId: subscription.id,
    deviceId: subscription.deviceId,
    active: subscription.active,
    retiredDuplicates: retired,
  });
}
