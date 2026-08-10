import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendPushNotification, isExpiredSubscription } from "@/lib/push";
import {
  getNotificationPayload,
  getNotificationTargetAt,
  shouldSkipNotification,
  type NotificationOffsetType,
} from "@/lib/timing";
import { skipRemainingEventNotifications } from "@/lib/notifications";
import { broadcastRallyUpdate } from "./rally-hub";
import { serializeEvent } from "@/lib/rally-event";

const POLL_INTERVAL_MS = 100;
const DUE_GRACE_MS = 100;

let schedulerRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

async function processNotificationEvent(eventId: string) {
  const now = Date.now();

  const notification = await prisma.$transaction(async (tx) => {
    const event = await tx.notificationEvent.findUnique({
      where: { id: eventId },
      include: {
        assignment: {
          include: {
            user: true,
            rallyEvent: true,
          },
        },
      },
    });

    if (!event || event.status !== "PENDING") return null;
    if (event.scheduledAt.getTime() > now + DUE_GRACE_MS) return null;
    if (event.assignment.rallyEvent.status !== "ACTIVE") return null;

    if (
      event.assignment.launchTime &&
      shouldSkipNotification(
        event.type as NotificationOffsetType,
        event.assignment.launchTime,
        new Date(now),
        event.scheduledAt
      )
    ) {
      await tx.notificationEvent.updateMany({
        where: { id: eventId, status: "PENDING" },
        data: { status: "SKIPPED", error: "not enough lead time" },
      });
      return null;
    }

    return event;
  });

  if (!notification) return;

  const claimed = await prisma.notificationEvent.updateMany({
    where: { id: eventId, status: "PENDING" },
    data: { status: "SENT" },
  });
  if (claimed.count === 0) return;

  const { assignment } = notification;
  const { user, rallyEvent } = assignment;
  const callerName = assignment.callerName;
  const sentAt = new Date();
  const latencyMs = sentAt.getTime() - notification.scheduledAt.getTime();

  if (!rallyEvent.targetArrivalTime) {
    await prisma.notificationEvent.update({
      where: { id: eventId },
      data: { status: "SKIPPED", error: "no target arrival time" },
    });
    return;
  }

  const notificationType = notification.type as NotificationOffsetType;
  const targetAt =
    assignment.launchTime &&
    getNotificationTargetAt(assignment.launchTime, notificationType, {
      startedAt: rallyEvent.startedAt,
    }).toISOString();

  const { title, body } = getNotificationPayload(
    notificationType,
    rallyEvent.name,
    callerName,
    rallyEvent.targetArrivalTime,
    assignment.marchDurationSeconds,
    rallyEvent.gatherDurationSeconds
  );

  if (!user) {
    await prisma.notificationEvent.update({
      where: { id: eventId },
      data: {
        sentAt,
        latencyMs,
        status: "SKIPPED",
        error: "no linked account",
      },
    });
    return;
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: user.id, active: true },
  });

  let successCount = 0;
  let failCount = 0;
  let lastError: string | null = null;

  for (const sub of subscriptions) {
    const result = await sendPushNotification(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      {
        title,
        body,
        rallyId: rallyEvent.id,
        notificationType: notification.type,
        assignmentId: assignment.id,
        scheduledAt: notification.scheduledAt.toISOString(),
        targetAt: targetAt || undefined,
      }
    );

    if (result.success) {
      successCount++;
    } else {
      failCount++;
      lastError = result.error || "failed";
      if (isExpiredSubscription(result.statusCode)) {
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { active: false },
        });
      }
    }
  }

  const success = successCount > 0 || subscriptions.length === 0;

  await prisma.notificationEvent.update({
    where: { id: eventId },
    data: {
      sentAt,
      latencyMs,
      status: success ? "SENT" : "FAILED",
      error: failCount > 0 ? lastError : subscriptions.length === 0 ? "no devices" : null,
    },
  });

  logger.info("notification_sent", {
    caller: callerName,
    rally: rallyEvent.name,
    type: notification.type,
    scheduledAt: notification.scheduledAt.toISOString(),
    sentAt: sentAt.toISOString(),
    latencyMs,
    success,
  });

  if (notification.type === "LAUNCH") {
    const allLaunchSent = await prisma.notificationEvent.count({
      where: {
        assignment: { rallyEventId: rallyEvent.id },
        type: "LAUNCH",
        status: { not: "SENT" },
      },
    });

    const pastArrival =
      rallyEvent.targetArrivalTime &&
      rallyEvent.targetArrivalTime.getTime() <= now;
    if (allLaunchSent === 0 && pastArrival) {
      await skipRemainingEventNotifications(rallyEvent.id, "rally ended");
      const completed = await prisma.rallyEvent.update({
        where: { id: rallyEvent.id },
        data: { status: "COMPLETED", completedAt: new Date() },
        include: {
          assignments: { include: { user: true }, orderBy: { launchTime: "asc" } },
        },
      });
      broadcastRallyUpdate(rallyEvent.id, serializeEvent(completed));
    }
  }
}

async function tick() {
  const now = Date.now();

  const pending = await prisma.notificationEvent.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: new Date(now + DUE_GRACE_MS) },
      assignment: {
        rallyEvent: { status: "ACTIVE" },
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: 100,
  });

  for (const event of pending) {
    await processNotificationEvent(event.id);
  }

  const activeEvents = await prisma.rallyEvent.findMany({
    where: {
      status: "ACTIVE",
      targetArrivalTime: { not: null, lte: new Date(now) },
    },
  });

  for (const event of activeEvents) {
    await skipRemainingEventNotifications(event.id, "rally ended");
    const completed = await prisma.rallyEvent.update({
      where: { id: event.id },
      data: { status: "COMPLETED", completedAt: new Date() },
      include: {
        assignments: { include: { user: true }, orderBy: { launchTime: "asc" } },
      },
    });
    broadcastRallyUpdate(event.id, serializeEvent(completed));
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
  if (schedulerInterval) clearInterval(schedulerInterval);
  schedulerInterval = null;
  schedulerRunning = false;
}
