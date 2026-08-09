import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { recalculateAssignmentTimes, serializeEvent } from "@/lib/rally-event";
import { parseMarchDuration } from "@/lib/timing";
import { cancelPendingNotifications, createNotificationEventsForAssignment } from "@/lib/notifications";

interface RouteParams {
  params: { id: string; assignmentId: string };
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const { id, assignmentId } = params;
  if (!isValidUuid(id) || !isValidUuid(assignmentId)) {
    return errorResponse("Invalid ID");
  }

  const event = await prisma.rallyEvent.findUnique({ where: { id } });
  const assignment = await prisma.rallyAssignment.findUnique({
    where: { id: assignmentId },
  });
  if (!event || !assignment || assignment.rallyEventId !== id) {
    return errorResponse("Not found", 404);
  }
  if (event.status === "ACTIVE") {
    return errorResponse("Cannot edit march times while rally is running", 400);
  }

  let body: { marchDuration?: string; marchDurationSeconds?: number };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  let marchSeconds = body.marchDurationSeconds;
  if (body.marchDuration) {
    const parsed = parseMarchDuration(body.marchDuration);
    if (parsed === null) return errorResponse("Invalid march duration");
    marchSeconds = parsed;
  }
  if (!marchSeconds) return errorResponse("marchDuration required");

  await prisma.rallyAssignment.update({
    where: { id: assignmentId },
    data: { marchDurationSeconds: marchSeconds, status: "WAITING" },
  });

  const updated = await prisma.rallyEvent.findUnique({
    where: { id },
    include: {
      assignments: { include: { user: true }, orderBy: { marchDurationSeconds: "desc" } },
    },
  });

  return jsonResponse(serializeEvent(updated!));
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin(_request);
  if (session instanceof Response) return session;

  const { id, assignmentId } = params;
  const event = await prisma.rallyEvent.findUnique({ where: { id } });
  if (event?.status === "ACTIVE") {
    return errorResponse("Cannot remove callers while rally is running", 400);
  }

  await prisma.rallyAssignment.deleteMany({
    where: { id: assignmentId, rallyEventId: id },
  });

  const updated = await prisma.rallyEvent.findUnique({
    where: { id },
    include: {
      assignments: { include: { user: true }, orderBy: { marchDurationSeconds: "desc" } },
    },
  });

  return jsonResponse(serializeEvent(updated!));
}
