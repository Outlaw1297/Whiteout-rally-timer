import { prisma } from "@/lib/prisma";
import {
  buildNotificationEventsForAssignment,
  recalculateAssignmentTimes,
} from "./rally-event";
import type { RallyAssignment, User } from "@prisma/client";

export async function createNotificationEventsForAssignment(
  assignment: RallyAssignment,
  user: User
) {
  if (!assignment.launchTime) return;

  const schedule = buildNotificationEventsForAssignment(assignment, user);
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
      await createNotificationEventsForAssignment(updated, assignment.user);
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
    await createNotificationEventsForAssignment(assignment, assignment.user);
  }
}
