import { prisma } from "@/lib/prisma";
import { serializeEvent, recalculateAssignmentTimes } from "@/lib/rally-event";
import { activateEventNotifications, cancelAllEventNotifications } from "@/lib/notifications";
import { broadcastRallyUpdate } from "@/server/rally-hub";
import { computeTargetArrivalOnGo } from "@/lib/timing";

const eventInclude = {
  assignments: { include: { user: true }, orderBy: { marchDurationSeconds: "desc" as const } },
};

export async function startOrRestartRally(eventId: string) {
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

  const startedAt = new Date();
  const marches = event.assignments.map((a) => a.marchDurationSeconds);
  const targetArrivalTime = computeTargetArrivalOnGo(
    startedAt,
    event.gatherDurationSeconds,
    marches,
    event.firstCallerLeadSeconds
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
        assignment.marchDurationSeconds
      );
      await tx.rallyAssignment.update({
        where: { id: assignment.id },
        data: { ...times, status: "WAITING", launchedConfirmedAt: null },
      });
    }
  });

  await activateEventNotifications(eventId);

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
