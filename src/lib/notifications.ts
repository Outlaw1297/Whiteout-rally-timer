import { prisma } from "@/lib/prisma";
import {
  buildNotificationEventsForAssignment,
  recalculateAssignmentTimes,
} from "./rally-event";
import type { RallyAssignment, User } from "@prisma/client";

export async function createNotificationEventsForAssignment(
  assignment: RallyAssignment,
  user: User,
  isFirstCaller = false
) {
  if (!assignment.launchTime) return;

  const schedule = buildNotificationEventsForAssignment(assignment, user, isFirstCaller);
  for (const event of schedule) {
    await prisma.notificationEvent.upsert({
      where: {
        rallyAssignmentId_type: {
          rallyAssignmentId: assignment.id,
          type: event.type,
        },
      },
      create: {
        rallyAssignmentId: assignment.id,
        type: event.type,
        scheduledAt: event.scheduledAt,
        status: "PENDING",
      },
      update: {
        scheduledAt: event.scheduledAt,
        status: "PENDING",
        sentAt: null,
        error: null,
        latencyMs: null,
      },
    });
  }
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
      const firstAssignmentId = event.assignments
        .map((a) => ({
          id: a.id,
          launchTime: recalculateAssignmentTimes(
            event.targetArrivalTime!,
            event.gatherDurationSeconds,
            a.marchDurationSeconds
          ).launchTime,
        }))
        .sort((a, b) => a.launchTime.getTime() - b.launchTime.getTime())[0]?.id;
      await createNotificationEventsForAssignment(
        updated,
        assignment.user,
        assignment.id === firstAssignmentId
      );
    }
  }
}

export async function activateEventNotifications(eventId: string) {
  const event = await prisma.rallyEvent.findUnique({
    where: { id: eventId },
    include: { assignments: { include: { user: true } } },
  });
  if (!event) return;

  const firstAssignmentId = [...event.assignments]
    .filter((a) => a.launchTime)
    .sort((a, b) => a.launchTime!.getTime() - b.launchTime!.getTime())[0]?.id;

  for (const assignment of event.assignments) {
    if (!assignment.user || !assignment.launchTime) continue;
    await createNotificationEventsForAssignment(
      assignment,
      assignment.user,
      assignment.id === firstAssignmentId
    );
  }
}
