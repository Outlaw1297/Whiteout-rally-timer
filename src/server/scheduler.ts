import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendPushNotification, isExpiredSubscription } from "@/lib/push";
import {
  getNotificationPayload,
  getNotificationTargetAt,
  resolveLateNotificationPresentation,
  shouldSkipNotification,
  type NotificationOffsetType,
} from "@/lib/timing";
import { completeRallyAfterLastCaller } from "@/lib/complete-rally";

const POLL_INTERVAL_MS = 100;
const DUE_GRACE_MS = 100;

let schedulerRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

function notificationPriority(type: string): number {
  if (type === "LAUNCH") return 0;
  if (String(type).startsWith("WARNING_")) return 1;
  if (type === "RALLY_STARTED") return 2;
  return 3;
}

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

    // If throw is imminent and LAUNCH is also due, skip stale warnings so the
    // Pixel gets one clear THROW banner instead of a late "10 seconds".
    if (
      String(event.type).startsWith("WARNING_") &&
      event.assignment.launchTime
    ) {
      const secondsLeft =
        (event.assignment.launchTime.getTime() - now) / 1000;
      if (secondsLeft <= 5) {
        const launchDue = await tx.notificationEvent.findFirst({
          where: {
            rallyAssignmentId: event.assignment.id,
            type: "LAUNCH",
            status: "PENDING",
            scheduledAt: { lte: new Date(now + DUE_GRACE_MS) },
          },
        });
        if (launchDue) {
          await tx.notificationEvent.updateMany({
            where: { id: eventId, status: "PENDING" },
            data: { status: "SKIPPED", error: "superseded by launch" },
          });
          return null;
        }
      }
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

  const basePayload = getNotificationPayload(
    notificationType,
    rallyEvent.name,
    callerName,
    rallyEvent.targetArrivalTime,
    assignment.marchDurationSeconds,
    rallyEvent.gatherDurationSeconds
  );

  const presented = resolveLateNotificationPresentation(
    notificationType,
    assignment.launchTime,
    now,
    basePayload
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
        title: presented.title,
        body: presented.body,
        rallyId: rallyEvent.id,
        notificationType: presented.type,
        assignmentId: assignment.id,
        scheduledAt: notification.scheduledAt.toISOString(),
        targetAt: targetAt || undefined,
        launchTime: assignment.launchTime?.toISOString(),
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
    presentedType: presented.type,
    escalated: presented.escalated,
    scheduledAt: notification.scheduledAt.toISOString(),
    sentAt: sentAt.toISOString(),
    latencyMs,
    success,
  });

  if (presented.type === "LAUNCH" || notification.type === "LAUNCH") {
    await completeRallyAfterLastCaller(rallyEvent.id, "last launch notification sent");
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

  // Prefer LAUNCH over late warnings so Pixel gets THROW, not a stale "10s".
  pending.sort((a, b) => {
    const byType = notificationPriority(a.type) - notificationPriority(b.type);
    if (byType !== 0) return byType;
    return a.scheduledAt.getTime() - b.scheduledAt.getTime();
  });

  for (const event of pending) {
    await processNotificationEvent(event.id);
  }

  const activeEvents = await prisma.rallyEvent.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });

  for (const event of activeEvents) {
    await completeRallyAfterLastCaller(event.id);
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
