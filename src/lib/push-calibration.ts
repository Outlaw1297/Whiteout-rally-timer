import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/push";
import { defaultDeliveryLeadMs } from "@/lib/delivery-lead";
import { shouldSkipSilentPush } from "@/lib/push-text";
import { isAdminRole } from "./roles";

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

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId, active: true },
  });

  if (subscriptions.length === 0) {
    return { error: "No active push subscription" as const, status: 404 as const };
  }

  // Apple/WebKit ignores `silent` and renders whitespace title/body as an empty
  // banner ("from Whiteout Rally" with no text). Never send blank silent pings there.
  const androidTargets = silent
    ? subscriptions.filter((sub) => !shouldSkipSilentPush(sub))
    : subscriptions;
  const appleTargets =
    silent && mode === "setup"
      ? subscriptions.filter((sub) => shouldSkipSilentPush(sub))
      : silent
        ? []
        : [];

  if (androidTargets.length === 0 && appleTargets.length === 0) {
    return {
      total: 0,
      pings: [] as Array<{ index: number; targetAt: string }>,
      mode,
      skippedApple: true,
      status: 200 as const,
    };
  }

  const pings: Array<{ index: number; targetAt: string }> = [];
  // Apple gets a single visible setup ping (WebKit cannot do silent push).
  const applePingCount = appleTargets.length > 0 ? 1 : 0;
  const effectiveCount = Math.max(pingCount, applePingCount);

  for (let i = 0; i < effectiveCount; i++) {
    const targetAt = new Date(Date.now() + 300).toISOString();

    if (i < pingCount) {
      for (const sub of androidTargets) {
        await sendPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          {
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
    }

    if (i === 0) {
      for (const sub of appleTargets) {
        await sendPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          {
            title: "Timing check",
            body: "Calibrating alert delay for this iPhone. You can dismiss this.",
            rallyId: "calibration",
            notificationType: "CALIBRATION",
            targetAt,
            calibrationIndex: 1,
            calibrationTotal: 1,
            silent: false,
            livePing: false,
          }
        );
      }
    }

    pings.push({ index: i + 1, targetAt });

    if (i < effectiveCount - 1) {
      await sleep(CALIBRATION_PING_SPACING_MS);
    }
  }

  return {
    total: Math.max(pingCount, applePingCount),
    pings,
    mode,
    status: 200 as const,
  };
}

export async function getCalibrationStatus(userId: string) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId, active: true },
    select: {
      id: true,
      platform: true,
      deliveryLeadMs: true,
      deliverySampleCount: true,
    },
  });

  const totalSamples = subscriptions.reduce((sum, s) => sum + s.deliverySampleCount, 0);
  const maxLead =
    subscriptions.length > 0
      ? Math.max(...subscriptions.map((s) => s.deliveryLeadMs))
      : defaultDeliveryLeadMs();

  return {
    devices: subscriptions,
    totalSamples,
    maxLeadMs: maxLead,
    isCalibrated: totalSamples >= CALIBRATION_PING_COUNT,
  };
}

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
