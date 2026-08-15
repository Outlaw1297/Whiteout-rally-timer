import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { normalizeDeviceId } from "@/lib/device-id";
import { pushFingerprint } from "@/lib/push-receipt";

/**
 * Confirm this browser's push endpoint is still registered for the signed-in user.
 * Used after deploys / SW updates when the OS subscription may have drifted from DB.
 */
export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    deviceId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  const endpoint = body.endpoint?.trim();
  if (!endpoint) return errorResponse("endpoint required");

  const subscription = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: {
      id: true,
      userId: true,
      active: true,
      platform: true,
      deliveryLeadMs: true,
      deliverySampleCount: true,
      p256dh: true,
      auth: true,
      deviceId: true,
    },
  });

  if (!subscription || subscription.userId !== session.id) {
    return jsonResponse({
      registered: false,
      active: false,
      reason: "not_found",
      matches: false,
    });
  }

  if (!subscription.active) {
    return jsonResponse({
      registered: true,
      active: false,
      reason: "inactive",
      subscriptionId: subscription.id,
      matches: false,
    });
  }

  const deviceId = normalizeDeviceId(body.deviceId);
  const keysMatch =
    !!body.keys?.p256dh &&
    !!body.keys?.auth &&
    subscription.p256dh === body.keys.p256dh &&
    subscription.auth === body.keys.auth;
  const deviceMatches = !deviceId || !subscription.deviceId || subscription.deviceId === deviceId;

  return jsonResponse({
    registered: true,
    active: true,
    matches: keysMatch && deviceMatches,
    reason: !keysMatch ? "encryption_keys_changed" : !deviceMatches ? "device_changed" : "ok",
    subscriptionId: subscription.id,
    platform: subscription.platform,
    deliveryLeadMs: subscription.deliveryLeadMs,
    deliverySampleCount: subscription.deliverySampleCount,
    endpointFingerprint: pushFingerprint(endpoint),
  });
}
