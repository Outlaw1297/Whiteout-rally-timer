import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { rateLimit, RATE_LIMITS, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { defaultDeliveryLeadMs } from "@/lib/delivery-lead";
import { normalizeDeviceId } from "@/lib/device-id";
import { retireDuplicatePushSubscriptions } from "@/lib/push-devices";
import { writeActivityLog } from "@/lib/write-activity-log";
import {
  EXPO_PUSH_KEY_PLACEHOLDER,
  expoEndpointFromToken,
  isValidExpoPushToken,
} from "@/lib/expo-push";

/**
 * Register an Expo push token for the native caller app.
 * Stores the token as a PushSubscription with endpoint `expo:<token>`.
 */
export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  const ip = getClientIp(request);
  const limit = rateLimit(`push-subscribe:${ip}`, RATE_LIMITS.pushSubscribe);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  let body: {
    expoPushToken?: string;
    platform?: string;
    deviceId?: string;
    userAgent?: string;
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  if (!isValidExpoPushToken(body.expoPushToken)) {
    return errorResponse("Valid expoPushToken is required");
  }

  const expoPushToken = body.expoPushToken!.trim();
  const endpoint = expoEndpointFromToken(expoPushToken);
  const deviceId = normalizeDeviceId(body.deviceId);
  const platform =
    (typeof body.platform === "string" && body.platform.trim()) || "Expo";
  const userAgent =
    (typeof body.userAgent === "string" && body.userAgent.trim()) ||
    request.headers.get("user-agent") ||
    `expo-native/${platform}`;

  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
  });
  const sameDevice =
    existing &&
    existing.userId === session.id &&
    ((deviceId && existing.deviceId === deviceId) || existing.endpoint === endpoint);
  const priorDevice =
    !sameDevice && deviceId
      ? await prisma.pushSubscription.findFirst({
          where: {
            userId: session.id,
            deviceId,
            ...(existing ? { id: { not: existing.id } } : {}),
          },
          orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
        })
      : null;
  const calibrationSource = sameDevice ? existing : priorDevice;
  const samePhysicalDevice = !!calibrationSource;
  const freshLead = defaultDeliveryLeadMs(
    calibrationSource?.deliveryLeadMs,
    platform
  );

  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: session.id,
      endpoint,
      p256dh: EXPO_PUSH_KEY_PLACEHOLDER,
      auth: EXPO_PUSH_KEY_PLACEHOLDER,
      userAgent,
      platform,
      deviceId,
      active: true,
      deliveryLeadMs: freshLead,
      deliverySampleCount: calibrationSource?.deliverySampleCount ?? 0,
      deliveryP50Ms: calibrationSource?.deliveryP50Ms ?? null,
      deliveryP90Ms: calibrationSource?.deliveryP90Ms ?? null,
      deliveryWindowCount: calibrationSource?.deliveryWindowCount ?? 0,
      lastCalibratedAt: calibrationSource?.lastCalibratedAt ?? null,
      lastSeenAt: new Date(),
    },
    update: {
      userId: session.id,
      p256dh: EXPO_PUSH_KEY_PLACEHOLDER,
      auth: EXPO_PUSH_KEY_PLACEHOLDER,
      userAgent,
      platform,
      deviceId: deviceId ?? undefined,
      active: true,
      lastSeenAt: new Date(),
      ...(sameDevice
        ? {}
        : calibrationSource
          ? {
              deliveryLeadMs: freshLead,
              deliverySampleCount: calibrationSource.deliverySampleCount,
              deliveryP50Ms: calibrationSource.deliveryP50Ms,
              deliveryP90Ms: calibrationSource.deliveryP90Ms,
              deliveryWindowCount: calibrationSource.deliveryWindowCount,
              lastCalibratedAt: calibrationSource.lastCalibratedAt,
            }
          : {
              deliveryLeadMs: freshLead,
              deliverySampleCount: 0,
              deliveryP50Ms: null,
              deliveryP90Ms: null,
              deliveryWindowCount: 0,
              lastCalibratedAt: null,
            }),
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
      ? `${session.displayName} registered native Expo push (${platform})`
      : `${session.displayName} re-registered native Expo push (${platform})`,
    meta: {
      created: isNew,
      retiredDuplicates: retired,
      sameDevice,
      provider: "expo",
    },
  });

  await prisma.user.update({
    where: { id: session.id },
    data: {
      lastSeenAt: new Date(),
      ...(samePhysicalDevice ? {} : { deliveryLeadMs: freshLead, deliverySampleCount: 0 }),
    },
  });

  return jsonResponse({
    success: true,
    subscriptionId: subscription.id,
    deviceId: subscription.deviceId,
    endpoint,
    active: subscription.active,
    retiredDuplicates: retired,
    provider: "expo",
  });
}
