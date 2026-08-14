import { prisma } from "@/lib/prisma";
import { listCanonicalPushSubscriptions } from "@/lib/push-devices";
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
import { pushEndpointHost, type ActivityLogInput } from "@/lib/activity-log";
import { writeActivityLogs } from "@/lib/write-activity-log";

const POLL_INTERVAL_MS = 100;
const DUE_GRACE_MS = 100;
/** Process many due notifications concurrently — crucial for 100+ simultaneous pushes. */
const MAX_PARALLEL_NOTIFICATIONS = 20;
/** Fan out device deliveries for one notification event in parallel. */
const MAX_PARALLEL_DEVICES = 16;
/** Cap batch size per tick so we stay within starter-tier memory. */
const LAUNCH_BATCH = 80;
const OTHER_BATCH = 120;

let schedulerRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
/** Prevent overlapping ticks — concurrent ticks were stranding LAUNCH as PENDING overdue. */
let tickInProgress = false;

function notificationPriority(type: string): number {
  if (type === "RALLY_STARTED") return 0;
  if (type === "LAUNCH") return 1;
  if (String(type).startsWith("WARNING_")) return 2;
  return 3;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let next = 0;

  async function run() {
    while (next < items.length) {
      const index = next++;
      await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => run()));
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

    const rallyStatus = event.assignment.rallyEvent.status;
    const isLaunch = event.type === "LAUNCH";
    // THROW must still deliver after a wall-clock complete race. Other alerts
    // only fire while the rally is ACTIVE.
    if (rallyStatus !== "ACTIVE" && !(isLaunch && rallyStatus === "COMPLETED")) {
      logger.warn("notification_blocked_inactive_rally", {
        eventId,
        type: event.type,
        rallyStatus,
      });
      await tx.notificationEvent.updateMany({
        where: { id: eventId, status: "PENDING" },
        data: {
          status: "SKIPPED",
          error: `rally ${String(rallyStatus).toLowerCase()}`,
        },
      });
      return null;
    }
    if (isLaunch && rallyStatus === "COMPLETED") {
      logger.info("launch_flush_after_rally_completed", {
        eventId,
        scheduledAt: event.scheduledAt.toISOString(),
      });
    }

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

    // Skip stale warnings only when LAUNCH is already due — never block LAUNCH itself.
    if (String(event.type).startsWith("WARNING_") && event.assignment.launchTime) {
      const secondsLeft = (event.assignment.launchTime.getTime() - now) / 1000;
      if (secondsLeft <= 2) {
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
    await writeActivityLogs([
      {
        kind: "PUSH_SKIPPED",
        success: false,
        userId: user?.id,
        username: user?.username,
        displayName: user?.displayName || callerName,
        message: `${rallyEvent.name} · ${notification.type} missed — no target arrival time`,
        error: "no target arrival time",
        meta: { source: "scheduler", rally: rallyEvent.name, type: notification.type },
      },
    ]);
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
    await writeActivityLogs([
      {
        kind: "PUSH_SKIPPED",
        success: false,
        displayName: callerName,
        message: `${rallyEvent.name} · ${notification.type} missed — ${callerName} has no linked account`,
        error: "no linked account",
        meta: { source: "scheduler", rally: rallyEvent.name, type: notification.type },
      },
    ]);
    return;
  }

  const subscriptions = await listCanonicalPushSubscriptions(user.id);

  // Linked account but no active push devices — not a successful send.
  if (subscriptions.length === 0) {
    await prisma.notificationEvent.update({
      where: { id: eventId },
      data: {
        sentAt,
        latencyMs,
        status: "SKIPPED",
        error: "no devices",
      },
    });
    logger.info("notification_skipped_no_devices", {
      caller: callerName,
      rally: rallyEvent.name,
      type: notification.type,
      scheduledAt: notification.scheduledAt.toISOString(),
    });
    await writeActivityLogs([
      {
        kind: "PUSH_SKIPPED",
        success: false,
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        message: `${rallyEvent.name} · ${notification.type} missed — no active devices for ${user.displayName}`,
        error: "no devices",
        meta: { source: "scheduler", rally: rallyEvent.name, type: notification.type },
      },
    ]);
    return;
  }

  let successCount = 0;
  let failCount = 0;
  let lastError: string | null = null;
  const expiredIds: string[] = [];
  const deviceLogs: ActivityLogInput[] = [];

  await mapPool(subscriptions, MAX_PARALLEL_DEVICES, async (sub) => {
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
      successCount += 1;
    } else {
      failCount += 1;
      lastError = result.error || "failed";
      if (isExpiredSubscription(result.statusCode)) {
        expiredIds.push(sub.id);
      }
    }

    deviceLogs.push({
      kind: result.success ? "PUSH_SENT" : "PUSH_FAILED",
      success: result.success,
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      deviceId: sub.deviceId,
      subscriptionId: sub.id,
      platform: sub.platform,
      message: result.success
        ? `${rallyEvent.name} · ${presented.type} accepted · ${sub.platform || "device"}`
        : `${rallyEvent.name} · ${presented.type} failed · ${sub.platform || "device"}`,
      error: result.error,
      meta: {
        source: "scheduler",
        rally: rallyEvent.name,
        type: notification.type,
        presentedType: presented.type,
        statusCode: result.statusCode ?? (result.success ? 201 : null),
        endpointHost: pushEndpointHost(sub.endpoint),
      },
    });
  });

  if (expiredIds.length > 0) {
    await prisma.pushSubscription.updateMany({
      where: { id: { in: expiredIds } },
      data: { active: false },
    });
  }

  const success = successCount > 0;

  await prisma.notificationEvent.update({
    where: { id: eventId },
    data: {
      sentAt,
      latencyMs,
      status: success ? "SENT" : "FAILED",
      error: success ? null : lastError,
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
    devices: subscriptions.length,
    successCount,
    failCount,
  });

  await writeActivityLogs(deviceLogs);
}

async function flushDueLaunchNotifications(now: number) {
  // Include COMPLETED rallies so THROW still fires after a complete/skip race.
  const dueLaunches = await prisma.notificationEvent.findMany({
    where: {
      type: "LAUNCH",
      status: "PENDING",
      scheduledAt: { lte: new Date(now + DUE_GRACE_MS) },
      assignment: {
        rallyEvent: { status: { in: ["ACTIVE", "COMPLETED"] } },
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: LAUNCH_BATCH,
  });

  await mapPool(dueLaunches, MAX_PARALLEL_NOTIFICATIONS, async (event) => {
    const overdueMs = now - event.scheduledAt.getTime();
    if (overdueMs > 2000) {
      logger.warn("launch_notification_overdue_flushing", {
        id: event.id,
        overdueMs,
        scheduledAt: event.scheduledAt.toISOString(),
      });
    }
    await processNotificationEvent(event.id);
  });

  return dueLaunches.length;
}

async function tick() {
  if (tickInProgress) return;
  tickInProgress = true;

  try {
    const now = Date.now();

    // 1) THROW first — never let rally-complete strand LAUNCH as PENDING overdue.
    await flushDueLaunchNotifications(now);

    // 2) Other due notifications (Started / warnings)
    const pending = await prisma.notificationEvent.findMany({
      where: {
        status: "PENDING",
        type: { not: "LAUNCH" },
        scheduledAt: { lte: new Date(now + DUE_GRACE_MS) },
        assignment: {
          rallyEvent: { status: "ACTIVE" },
        },
      },
      orderBy: { scheduledAt: "asc" },
      take: OTHER_BATCH,
    });

    pending.sort((a, b) => {
      const byType = notificationPriority(a.type) - notificationPriority(b.type);
      if (byType !== 0) return byType;
      return a.scheduledAt.getTime() - b.scheduledAt.getTime();
    });

    await mapPool(pending, MAX_PARALLEL_NOTIFICATIONS, async (event) => {
      await processNotificationEvent(event.id);
    });

    // 3) Complete only after due LAUNCHes were flushed (completeRally also defers
    //    while any LAUNCH is still PENDING).
    const activeEvents = await prisma.rallyEvent.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });

    await mapPool(activeEvents, 8, async (event) => {
      await completeRallyAfterLastCaller(event.id);
    });
  } finally {
    tickInProgress = false;
  }
}

export function startScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  logger.info("scheduler_started", {
    pollIntervalMs: POLL_INTERVAL_MS,
    maxParallelNotifications: MAX_PARALLEL_NOTIFICATIONS,
    maxParallelDevices: MAX_PARALLEL_DEVICES,
  });

  tick().catch((err) => logger.error("scheduler_tick_error", { error: String(err) }));
  schedulerInterval = setInterval(() => {
    tick().catch((err) => logger.error("scheduler_tick_error", { error: String(err) }));
  }, POLL_INTERVAL_MS);
}

export function stopScheduler() {
  if (schedulerInterval) clearInterval(schedulerInterval);
  schedulerInterval = null;
  schedulerRunning = false;
  tickInProgress = false;
}
