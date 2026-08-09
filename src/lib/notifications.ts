import { prisma } from "@/lib/prisma";
import {
  buildNotificationEventsForAssignment,
  recalculateAssignmentTimes,
} from "./rally-event";
import type { RallyAssignment, User, RallyEvent } from "@prisma/client";

const ALL_NOTIFICATION_TYPES = ["WARNING_10", "WARNING_5", "WARNING_3", "LAUNCH"] as const;

async function syncNotificationEventsForAssignment(
  assignment: RallyAssignment,
  user: User,
  event: Pick<RallyEvent, "pushLeadMs">
) {
  if (!assignment.launchTime) return;

  const schedule = buildNotificationEventsForAssignment(assignment, user, {
    referenceTime: new Date(),
    pushLeadMs: event.pushLeadMs,
  });

  const scheduledTypes = new Set(schedule.map((s) => s.type));

  for (const eventType of ALL_NOTIFICATION_TYPES) {
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
  event: Pick<RallyEvent, "pushLeadMs">
) {
  await syncNotificationEventsForAssignment(assignment, user, event);
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

export async function resetEventToTemplate(eventId: string) {
  await cancelAllEventNotifications(eventId);

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
      await createNotificationEventsForAssignment(updated, assignment.user, event);
    }
  }
}

export async function activateEventNotifications(eventId: string) {
  const event = await prisma.rallyEvent.findUnique({
    where: { id: eventId },
    include: { assignments: { include: { user: true } } },
  });
  if (!event) return;

  for (const assignment of event.assignments) {
    if (!assignment.user || !assignment.launchTime) continue;
    await createNotificationEventsForAssignment(assignment, assignment.user, event);
  }
}
