import { prisma } from "@/lib/prisma";
import {
  buildNotificationEventsForAssignment,
  recalculateAssignmentTimes,
} from "./rally-event";
import { getEffectivePushLeadMs } from "./delivery-lead";
import { ALL_SCHEDULED_NOTIFICATION_TYPES } from "./notification-prefs";
import type { RallyAssignment, User, RallyEvent } from "@prisma/client";

async function getPushLeadForUser(userId: string, eventPushLeadMs: number) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId, active: true },
    select: { deliveryLeadMs: true },
  });
  return getEffectivePushLeadMs(eventPushLeadMs, subscriptions);
}

async function syncNotificationEventsForAssignment(
  assignment: RallyAssignment,
  user: User,
  event: Pick<RallyEvent, "pushLeadMs" | "startedAt">,
  options: {
    preserveTerminal?: boolean;
    pushLeadMs?: number;
    includeRallyStarted?: boolean;
  } = {}
) {
  const preserveTerminal = options.preserveTerminal ?? true;
  if (!assignment.launchTime) return;

  const pushLeadMs = options.pushLeadMs ?? event.pushLeadMs;

  const schedule = buildNotificationEventsForAssignment(assignment, user, {
    referenceTime: new Date(),
    pushLeadMs,
    includeRallyStarted: options.includeRallyStarted ?? true,
    startedAt: event.startedAt,
  });

  const scheduledTypes = new Set(schedule.map((s) => s.type));

  for (const eventType of ALL_SCHEDULED_NOTIFICATION_TYPES) {
    if (!scheduledTypes.has(eventType)) {
      await prisma.notificationEvent.updateMany({
        where: {
          rallyAssignmentId: assignment.id,
          type: eventType,
          status: "PENDING",
        },
        data: { status: "SKIPPED", error: "not enough lead time" },
      });
    }
  }

  for (const item of schedule) {
    const existing = await prisma.notificationEvent.findUnique({
      where: {
        rallyAssignmentId_type: {
          rallyAssignmentId: assignment.id,
          type: item.type,
        },
      },
    });

    if (preserveTerminal && existing && ["SENT", "FAILED", "SKIPPED"].includes(existing.status)) {
      continue;
    }

    await prisma.notificationEvent.upsert({
      where: {
        rallyAssignmentId_type: {
          rallyAssignmentId: assignment.id,
          type: item.type,
        },
      },
      create: {
        rallyAssignmentId: assignment.id,
        type: item.type,
        scheduledAt: item.scheduledAt,
        status: "PENDING",
      },
      update: {
        scheduledAt: item.scheduledAt,
        status: "PENDING",
        sentAt: null,
        error: null,
        latencyMs: null,
      },
    });
  }
}

export async function createNotificationEventsForAssignment(
  assignment: RallyAssignment,
  user: User,
  event: Pick<RallyEvent, "pushLeadMs" | "startedAt">,
  options?: {
    preserveTerminal?: boolean;
    pushLeadMs?: number;
    includeRallyStarted?: boolean;
  }
) {
  await syncNotificationEventsForAssignment(assignment, user, event, options);
}

/** Remove all scheduled notifications so a new GO can start fresh. */
export async function clearEventNotificationEvents(eventId: string) {
  await prisma.notificationEvent.deleteMany({
    where: { assignment: { rallyEventId: eventId } },
  });
}

export async function cancelPendingNotifications(assignmentId: string) {
  await prisma.notificationEvent.updateMany({
    where: { rallyAssignmentId: assignmentId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
}

export async function cancelAllEventNotifications(eventId: string) {
  await prisma.notificationEvent.updateMany({
    where: {
      assignment: { rallyEventId: eventId },
      status: "PENDING",
    },
    data: { status: "CANCELLED" },
  });
}

/** Mark any still-pending notifications as skipped when a rally ends. */
export async function skipRemainingEventNotifications(eventId: string, reason: string) {
  await prisma.notificationEvent.updateMany({
    where: {
      assignment: { rallyEventId: eventId },
      status: "PENDING",
    },
    data: { status: "SKIPPED", error: reason },
  });
}

export async function resetEventToTemplate(eventId: string) {
  await clearEventNotificationEvents(eventId);

  await prisma.$transaction(async (tx) => {
    await tx.rallyEvent.update({
      where: { id: eventId },
      data: {
        status: "READY",
        targetArrivalTime: null,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
      },
    });

    await tx.rallyAssignment.updateMany({
      where: { rallyEventId: eventId },
      data: {
        launchTime: null,
        expectedArrivalTime: null,
        status: "WAITING",
        launchedConfirmedAt: null,
      },
    });
  });
}

export async function rescheduleEventNotifications(eventId: string) {
  const event = await prisma.rallyEvent.findUnique({
    where: { id: eventId },
    include: {
      assignments: { include: { user: true, notificationEvents: true } },
    },
  });
  if (!event || !event.targetArrivalTime) return;

  for (const assignment of event.assignments) {
    const { launchTime, expectedArrivalTime } = recalculateAssignmentTimes(
      event.targetArrivalTime,
      event.gatherDurationSeconds,
      assignment.marchDurationSeconds
    );

    await prisma.rallyAssignment.update({
      where: { id: assignment.id },
      data: { launchTime, expectedArrivalTime, status: "WAITING", launchedConfirmedAt: null },
    });

    await cancelPendingNotifications(assignment.id);

    const updated = await prisma.rallyAssignment.findUnique({
      where: { id: assignment.id },
    });
    if (updated && assignment.user) {
      const pushLeadMs = await getPushLeadForUser(assignment.user.id, event.pushLeadMs);
      await createNotificationEventsForAssignment(updated, assignment.user, event, {
        pushLeadMs,
      });
    }
  }
}

export async function activateEventNotifications(
  eventId: string,
  options?: { freshLaunch?: boolean }
) {
  const event = await prisma.rallyEvent.findUnique({
    where: { id: eventId },
    include: { assignments: { include: { user: true } } },
  });
  if (!event) return;

  const syncOptions = {
    preserveTerminal: !options?.freshLaunch,
    includeRallyStarted: true,
  };

  for (const assignment of event.assignments) {
    if (!assignment.user || !assignment.launchTime) continue;

    const pushLeadMs = await getPushLeadForUser(assignment.user.id, event.pushLeadMs);

    await createNotificationEventsForAssignment(
      assignment,
      assignment.user,
      event,
      { ...syncOptions, pushLeadMs }
    );
  }
}
