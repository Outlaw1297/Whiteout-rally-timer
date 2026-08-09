import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendPushNotification, isExpiredSubscription } from "@/lib/push";
import {
  getNotificationPayload,
  type NotificationOffsetType,
} from "@/lib/timing";
import { broadcastRallyUpdate } from "./rally-hub";
import { serializeEvent } from "@/lib/rally-event";

const POLL_INTERVAL_MS = 100;
const LOOK_AHEAD_MS = 60_000;
const LOOK_BEHIND_MS = 30_000;

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
    if (event.scheduledAt.getTime() > now + 100) return null;
    if (event.assignment.rallyEvent.status !== "ACTIVE") return null;

    const updated = await tx.notificationEvent.updateMany({
      where: { id: eventId, status: "PENDING" },
      data: { status: "SENT" },
    });
    if (updated.count === 0) return null;

    return event;
  });

  if (!notification) return;

  const { assignment } = notification;
  const { user, rallyEvent } = assignment;
  const sentAt = new Date();
  const latencyMs = sentAt.getTime() - notification.scheduledAt.getTime();

  const { title, body } = getNotificationPayload(
    notification.type as NotificationOffsetType,
    rallyEvent.name,
    user.displayName,
    rallyEvent.targetArrivalTime,
    assignment.marchDurationSeconds,
    rallyEvent.gatherDurationSeconds
  );

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
    caller: user.displayName,
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

    const pastArrival = rallyEvent.targetArrivalTime.getTime() <= now;
    if (allLaunchSent === 0 && pastArrival) {
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
      scheduledAt: {
        gte: new Date(now - LOOK_BEHIND_MS),
        lte: new Date(now + 100),
      },
      assignment: {
        rallyEvent: { status: "ACTIVE" },
      },
    },
    take: 50,
  });

  for (const event of pending) {
    await processNotificationEvent(event.id);
  }

  const activeEvents = await prisma.rallyEvent.findMany({
    where: {
      status: "ACTIVE",
      targetArrivalTime: { lte: new Date(now) },
    },
  });

  for (const event of activeEvents) {
    const pendingLaunch = await prisma.notificationEvent.count({
      where: {
        assignment: { rallyEventId: event.id },
        type: "LAUNCH",
        status: "PENDING",
      },
    });
    if (pendingLaunch === 0) {
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
