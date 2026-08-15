import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/push";
import { defaultDeliveryLeadMs } from "@/lib/delivery-lead";
import { listCanonicalPushSubscriptions } from "@/lib/push-devices";

export const CALIBRATION_PING_COUNT = 1;
export const CALIBRATION_PING_SPACING_MS = 700;
export const LIVE_PING_COUNT = 1;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendCalibrationPings(
  userId: string,
  options: { mode?: "setup" | "live"; silent?: boolean } = {}
) {
  const mode = options.mode === "live" ? "live" : "setup";
  // WebKit revokes subscriptions that receive pushes without a user-visible
  // notification. Calibration must therefore always be visible.
  const silent = false;
  const pingCount = mode === "live" ? LIVE_PING_COUNT : CALIBRATION_PING_COUNT;

  const subscriptions = await listCanonicalPushSubscriptions(userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, displayName: true },
  });

  if (subscriptions.length === 0) {
    return { error: "No active push subscription" as const, status: 404 as const };
  }

  const pings: Array<{ index: number; targetAt: string }> = [];

  for (let i = 0; i < pingCount; i++) {
    // Calibration is sent immediately; targetAt is therefore the send baseline
    // used to measure transport time, not a future scheduled display moment.
    const targetAt = new Date().toISOString();

    for (const sub of subscriptions) {
      await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        {
          title: "🔔 Rally notification timing check",
          body: "This visible test confirms notification delivery and measures timing.",
          rallyId: mode === "live" ? "calibration-live" : "calibration",
          notificationType: "CALIBRATION",
          targetAt,
          calibrationIndex: i + 1,
          calibrationTotal: pingCount,
          silent,
          livePing: false,
        },
        {
          source: "calibration",
          userId,
          username: user?.username,
          displayName: user?.displayName,
          subscriptionId: sub.id,
          deviceId: sub.deviceId,
          platform: sub.platform,
        }
      );
    }

    pings.push({ index: i + 1, targetAt });

    if (i < pingCount - 1) {
      await sleep(CALIBRATION_PING_SPACING_MS);
    }
  }

  return {
    total: pingCount,
    pings,
    mode,
    status: 200 as const,
  };
}

export async function getCalibrationStatus(userId: string) {
  const subscriptions = await listCanonicalPushSubscriptions(userId);

  const totalSamples = subscriptions.reduce((sum, s) => sum + s.deliverySampleCount, 0);
  const maxLead =
    subscriptions.length > 0
      ? Math.max(...subscriptions.map((s) => s.deliveryLeadMs))
      : defaultDeliveryLeadMs();

  return {
    devices: subscriptions.map((s) => ({
      id: s.id,
      platform: s.platform,
      deliveryLeadMs: s.deliveryLeadMs,
      deliverySampleCount: s.deliverySampleCount,
    })),
    totalSamples,
    maxLeadMs: maxLead,
    isCalibrated: totalSamples >= CALIBRATION_PING_COUNT,
  };
}

import { isAdminRole } from "./roles";

/** True when the user has no ACTIVE rallies (safe for background timing pings). */
export async function userHasActiveRally(userId: string, role: string): Promise<boolean> {
  if (isAdminRole(role)) {
    const active = await prisma.rallyEvent.count({
      where: { status: "ACTIVE" },
    });
    return active > 0;
  }

  const active = await prisma.rallyAssignment.count({
    where: {
      userId,
      rallyEvent: { status: "ACTIVE" },
    },
  });
  return active > 0;
}
