import { prisma } from "@/lib/prisma";
import { serializeEvent, recalculateAssignmentTimes } from "@/lib/rally-event";
import {
  activateEventNotifications,
  cancelAllEventNotifications,
  clearEventNotificationEvents,
} from "@/lib/notifications";
import { broadcastRallyUpdate } from "@/server/rally-hub";
import { computeTargetArrivalOnGo } from "@/lib/timing";

const eventInclude = {
  assignments: { include: { user: true }, orderBy: { marchDurationSeconds: "desc" as const } },
};

export async function startOrRestartRally(
  eventId: string,
  options: { startedAt?: Date; targetArrivalTime?: Date } = {}
) {
  const event = await prisma.rallyEvent.findUnique({
    where: { id: eventId },
    include: eventInclude,
  });

  if (!event) return { error: "Event not found" as const, status: 404 as const };
  if (event.status === "CANCELLED") {
    return { error: "Cannot start this event" as const, status: 400 as const };
  }
  if (event.assignments.length === 0) {
    return { error: "Add at least one caller before GO" as const, status: 400 as const };
  }

  if (event.status === "ACTIVE" || event.status === "COMPLETED") {
    await cancelAllEventNotifications(eventId);
  }

  // Always wipe prior run rows so GO AGAIN / RESTART schedules fresh PENDING events.
  await clearEventNotificationEvents(eventId);

  const startedAt = options.startedAt ?? new Date();
  const marches = event.assignments.map((a) => a.marchDurationSeconds);
  const offsets = event.assignments.map((a) => a.arrivalOffsetSeconds ?? 0);
  const targetArrivalTime =
    options.targetArrivalTime ??
    computeTargetArrivalOnGo(
      startedAt,
      event.gatherDurationSeconds,
      marches,
      event.firstCallerLeadSeconds,
      offsets
    );

  await prisma.$transaction(async (tx) => {
    await tx.rallyEvent.update({
      where: { id: eventId },
      data: {
        status: "ACTIVE",
        startedAt,
        targetArrivalTime,
        completedAt: null,
        cancelledAt: null,
      },
    });

    for (const assignment of event.assignments) {
      const times = recalculateAssignmentTimes(
        targetArrivalTime,
        event.gatherDurationSeconds,
        assignment.marchDurationSeconds,
        assignment.arrivalOffsetSeconds ?? 0
      );
      await tx.rallyAssignment.update({
        where: { id: assignment.id },
        data: { ...times, status: "WAITING", launchedConfirmedAt: null },
      });
    }
  });

  await activateEventNotifications(eventId, { freshLaunch: true });

  const updated = await prisma.rallyEvent.findUnique({
    where: { id: eventId },
    include: {
      assignments: { include: { user: true }, orderBy: { launchTime: "asc" } },
    },
  });

  const payload = serializeEvent(updated!);
  broadcastRallyUpdate(eventId, payload);

  return { event: payload, status: 200 as const };
}
