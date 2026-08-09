import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  NOTIFICATION_OFFSETS,
  NOTIFICATION_MESSAGES,
  getScheduledNotificationTime,
  type NotificationField,
  type NotificationType,
} from "@/lib/time";
import { sendPushNotification, isExpiredSubscription } from "@/lib/push";

const POLL_INTERVAL_MS = 100;

let schedulerRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

async function processNotification(
  rallyId: string,
  rallyTimeMs: number,
  notificationType: NotificationType,
  field: NotificationField,
  secondsBefore: number
) {
  const scheduledAtMs = getScheduledNotificationTime(rallyTimeMs, secondsBefore);
  const scheduledAt = new Date(scheduledAtMs);
  const now = Date.now();

  if (now < scheduledAtMs) return;

  const result = await prisma.$transaction(async (tx) => {
    const rally = await tx.rally.findUnique({ where: { id: rallyId } });
    if (!rally || rally.cancelled || rally[field]) return null;

    const updated = await tx.rally.updateMany({
      where: { id: rallyId, [field]: false },
      data: { [field]: true },
    });

    if (updated.count === 0) return null;

    return rally;
  });

  if (!result) return;

  const sentAt = new Date();
  const latencyMs = sentAt.getTime() - scheduledAtMs;

  logger.notificationScheduled(rallyId, notificationType, scheduledAt.toISOString());

  const subscribers = await prisma.rallySubscriber.findMany({
    where: { rallyId },
    include: {
      pushSubscription: true,
    },
  });

  const message = NOTIFICATION_MESSAGES[notificationType];
  let successCount = 0;
  let failCount = 0;

  for (const sub of subscribers) {
    if (!sub.pushSubscription.active) continue;

    const pushResult = await sendPushNotification(
      {
        endpoint: sub.pushSubscription.endpoint,
        p256dh: sub.pushSubscription.p256dh,
        auth: sub.pushSubscription.auth,
      },
      {
        title: "Whiteout Rally",
        body: message,
        rallyId,
        notificationType,
      }
    );

    if (pushResult.success) {
      successCount++;
    } else {
      failCount++;
      if (isExpiredSubscription(pushResult.statusCode)) {
        await prisma.pushSubscription.update({
          where: { id: sub.pushSubscription.id },
          data: { active: false },
        });
        logger.pushSubscriptionRemoved(
          sub.pushSubscription.id,
          `HTTP ${pushResult.statusCode}`
        );
      }
    }
  }

  await prisma.notificationLog.create({
    data: {
      rallyId,
      notificationType,
      scheduledAt,
      sentAt,
      latencyMs,
      success: successCount > 0 || subscribers.length === 0,
      errorMessage: failCount > 0 ? `${failCount} delivery failures` : null,
    },
  });

  if (successCount > 0 || subscribers.length === 0) {
    logger.notificationSent(
      rallyId,
      notificationType,
      scheduledAt.toISOString(),
      sentAt.toISOString(),
      latencyMs
    );
  } else {
    logger.notificationFailed(rallyId, notificationType, "All deliveries failed");
  }

  if (notificationType === "T+0") {
    await prisma.rally.update({
      where: { id: rallyId },
      data: { status: "COMPLETED" },
    });
  }
}

async function tick() {
  const now = Date.now();
  const lookAheadMs = 35_000;
  const lookBehindMs = 5_000;

  const rallies = await prisma.rally.findMany({
    where: {
      cancelled: false,
      rallyTime: {
        gte: new Date(now - lookBehindMs),
        lte: new Date(now + lookAheadMs),
      },
    },
  });

  for (const rally of rallies) {
    const rallyTimeMs = rally.rallyTime.getTime();

    if (rallyTimeMs > now + lookAheadMs) continue;

    if (rally.status === "SCHEDULED" && rallyTimeMs <= now + 30_000) {
      await prisma.rally.update({
        where: { id: rally.id },
        data: { status: "ACTIVE" },
      });
    }

    for (const offset of NOTIFICATION_OFFSETS) {
      if (rally[offset.field]) continue;

      const scheduledMs = getScheduledNotificationTime(rallyTimeMs, offset.seconds);
      if (scheduledMs <= now + 100) {
        await processNotification(
          rally.id,
          rallyTimeMs,
          offset.type,
          offset.field,
          offset.seconds
        );
      }
    }
  }
}

export function startScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;

  logger.info("scheduler_started", { pollIntervalMs: POLL_INTERVAL_MS });

  tick().catch((err) => logger.error("scheduler_tick_error", { error: String(err) }));

  schedulerInterval = setInterval(() => {
    tick().catch((err) => logger.error("scheduler_tick_error", { error: String(err) }));
  }, POLL_INTERVAL_MS);
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  schedulerRunning = false;
  logger.info("scheduler_stopped");
}
