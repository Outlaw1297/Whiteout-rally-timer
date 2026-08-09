import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { serializeEvent, recalculateAssignmentTimes } from "@/lib/rally-event";
import { activateEventNotifications } from "@/lib/notifications";
import { broadcastRallyUpdate } from "@/server/rally-hub";
import { computeTargetArrivalOnGo } from "@/lib/timing";

interface RouteParams {
  params: { id: string };
}

const eventInclude = {
  assignments: { include: { user: true }, orderBy: { marchDurationSeconds: "desc" as const } },
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid event ID");

  const event = await prisma.rallyEvent.findUnique({
    where: { id },
    include: eventInclude,
  });

  if (!event) return errorResponse("Event not found", 404);
  if (event.status === "CANCELLED" || event.status === "COMPLETED") {
    return errorResponse("Cannot start this event", 400);
  }
  if (event.status === "ACTIVE") {
    return errorResponse("Rally already running", 400);
  }
  if (event.assignments.length === 0) {
    return errorResponse("Add at least one caller before GO", 400);
  }

  const startedAt = new Date();
  const marches = event.assignments.map((a) => a.marchDurationSeconds);
  const targetArrivalTime = computeTargetArrivalOnGo(
    startedAt,
    event.gatherDurationSeconds,
    marches
  );

  await prisma.$transaction(async (tx) => {
    await tx.rallyEvent.update({
      where: { id },
      data: { status: "ACTIVE", startedAt, targetArrivalTime },
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

  await activateEventNotifications(id);

  const updated = await prisma.rallyEvent.findUnique({
    where: { id },
    include: {
      assignments: { include: { user: true }, orderBy: { launchTime: "asc" } },
    },
  });

  const payload = serializeEvent(updated!);
  broadcastRallyUpdate(id, payload);

  return jsonResponse({ event: payload });
}
