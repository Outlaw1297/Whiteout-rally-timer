import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/push";
import { defaultDeliveryLeadMs } from "@/lib/delivery-lead";

export const CALIBRATION_PING_COUNT = 3;
export const CALIBRATION_PING_SPACING_MS = 700;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendCalibrationPings(userId: string) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId, active: true },
  });

  if (subscriptions.length === 0) {
    return { error: "No active push subscription" as const, status: 404 as const };
  }

  const pings: Array<{ index: number; targetAt: string }> = [];

  for (let i = 0; i < CALIBRATION_PING_COUNT; i++) {
    const targetAt = new Date(Date.now() + 300).toISOString();

    for (const sub of subscriptions) {
      await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        {
          title: "Calibrating notifications",
          body: `Timing setup ${i + 1} of ${CALIBRATION_PING_COUNT}`,
          rallyId: "calibration",
          notificationType: "CALIBRATION",
          targetAt,
          calibrationIndex: i + 1,
          calibrationTotal: CALIBRATION_PING_COUNT,
        }
      );
    }

    pings.push({ index: i + 1, targetAt });

    if (i < CALIBRATION_PING_COUNT - 1) {
      await sleep(CALIBRATION_PING_SPACING_MS);
    }
  }

  return {
    total: CALIBRATION_PING_COUNT,
    pings,
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
