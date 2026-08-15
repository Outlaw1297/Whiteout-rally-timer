import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/push";
import { defaultDeliveryLeadMs } from "@/lib/delivery-lead";
import { listCanonicalPushSubscriptions } from "@/lib/push-devices";
import { allowsSilentWebPush } from "@/lib/device-platform";

export const CALIBRATION_PING_COUNT = 3;
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
  const silent = options.silent !== false; // default quiet
  const pingCount = mode === "live" ? LIVE_PING_COUNT : CALIBRATION_PING_COUNT;

  const subscriptions = await listCanonicalPushSubscriptions(userId);

  if (subscriptions.length === 0) {
    return { error: "No active push subscription" as const, status: 404 as const };
  }

  const deliverable = subscriptions.filter((sub) =>
    allowsSilentWebPush(sub.platform, sub.userAgent)
  );

  // iPhone/iPad: never send silent calibration or live pings. They burn Apple's
  // push budget and then throw alerts stop arriving even though test pushes worked.
  if (deliverable.length === 0) {
    return {
      skippedIos: true as const,
      total: 0,
      pings: [] as Array<{ index: number; targetAt: string }>,
      mode,
      status: 200 as const,
    };
  }

  const pings: Array<{ index: number; targetAt: string }> = [];

  for (let i = 0; i < pingCount; i++) {
    const targetAt = new Date(Date.now() + 300).toISOString();

    for (const sub of deliverable) {
      await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        {
          // Blank title/body — SW skips OS banners for silent calibration when the
          // app is open, and immediately closes any required placeholder when not.
          title: " ",
          body: " ",
          rallyId: mode === "live" ? "calibration-live" : "calibration",
          notificationType: "CALIBRATION",
          targetAt,
          calibrationIndex: i + 1,
          calibrationTotal: pingCount,
          silent: true,
          livePing: mode === "live",
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
