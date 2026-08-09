import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  NOTIFICATION_OFFSETS,
  getNotificationPayload,
  getScheduledNotificationTime,
  type NotificationField,
  type NotificationType,
} from "@/lib/time";
import { sendPushNotification, isExpiredSubscription } from "@/lib/push";
import { broadcastRallyUpdate } from "./rally-hub";
import { serializeRally } from "@/lib/rally";

const POLL_INTERVAL_MS = 100;
const LOOK_AHEAD_MS = 35_000;
const LOOK_BEHIND_MS = 30_000;

let schedulerRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

async function processNotification(
  rallyId: string,
  rallyTitle: string,
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
    if (!rally || rally.cancelled || rally[field] || !rally.rallyTime) return null;

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
    include: { pushSubscription: true },
  });

  const { title, body } = getNotificationPayload(notificationType, rallyTitle);
  let successCount = 0;
  let failCount = 0;
  let lastError: string | null = null;

  for (const sub of subscribers) {
    if (!sub.pushSubscription.active) continue;

    const pushResult = await sendPushNotification(
      {
        endpoint: sub.pushSubscription.endpoint,
        p256dh: sub.pushSubscription.p256dh,
        auth: sub.pushSubscription.auth,
      },
      { title, body, rallyId, notificationType }
    );

    if (pushResult.success) {
      successCount++;
    } else {
      failCount++;
      lastError = pushResult.error || "delivery failed";
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

  const noSubscribers = subscribers.length === 0;
  const success = successCount > 0 || noSubscribers;

  await prisma.notificationLog.create({
    data: {
      rallyId,
      notificationType,
      scheduledAt,
      sentAt,
      latencyMs,
      status: success ? "SENT" : "FAILED",
      success,
      errorMessage:
        failCount > 0
          ? `${failCount} delivery failures${lastError ? `: ${lastError}` : ""}`
          : noSubscribers
            ? "no subscribers"
            : null,
    },
  });

  if (success) {
    logger.notificationSent(
      rallyId,
      notificationType,
      scheduledAt.toISOString(),
      sentAt.toISOString(),
      latencyMs
    );
  } else {
    logger.notificationFailed(rallyId, notificationType, lastError || "All deliveries failed");
  }

  if (notificationType === "T+0") {
    const completed = await prisma.rally.update({
      where: { id: rallyId },
      data: { status: "COMPLETED" },
      include: {
        notificationLogs: { orderBy: { scheduledAt: "asc" } },
        _count: { select: { subscribers: true } },
      },
    });
    broadcastRallyUpdate(rallyId, serializeRally(completed));
  }
}

async function tick() {
  const now = Date.now();

  const rallies = await prisma.rally.findMany({
    where: {
      cancelled: false,
      status: { in: ["ACTIVE", "COMPLETED"] },
      rallyTime: { not: null },
    },
  });

  for (const rally of rallies) {
    if (!rally.rallyTime) continue;
    const rallyTimeMs = rally.rallyTime.getTime();

    if (rallyTimeMs < now - LOOK_BEHIND_MS) continue;
    if (rallyTimeMs > now + LOOK_AHEAD_MS) continue;

    for (const offset of NOTIFICATION_OFFSETS) {
      if (rally[offset.field]) continue;

      const scheduledMs = getScheduledNotificationTime(rallyTimeMs, offset.seconds);
      if (scheduledMs <= now + 100) {
        await processNotification(
          rally.id,
          rally.title,
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
