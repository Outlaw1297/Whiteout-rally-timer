import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin, canBeRallyCaller } from "@/lib/auth";
import { serializeEvent } from "@/lib/rally-event";
import { parseMarchDuration } from "@/lib/timing";
import { createNotificationEventsForAssignment } from "@/lib/notifications";

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

  let body: {
    marchDuration?: string;
    marchDurationSeconds?: number;
    userId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  if (
    event.status === "ACTIVE" &&
    (body.marchDuration !== undefined || body.marchDurationSeconds !== undefined)
  ) {
    return errorResponse("Cannot edit march times while rally is running", 400);
  }

  let marchSeconds = body.marchDurationSeconds;
  if (body.marchDuration) {
    const parsed = parseMarchDuration(body.marchDuration);
    if (parsed === null) return errorResponse("Invalid march duration");
    marchSeconds = parsed;
  }
  if (!marchSeconds && body.userId === undefined) {
    return errorResponse("marchDuration or userId required");
  }

  const updateData: {
    marchDurationSeconds?: number;
    userId?: string | null;
  } = {};

  if (marchSeconds) updateData.marchDurationSeconds = marchSeconds;
  if (body.userId !== undefined) {
    if (body.userId === null) {
      updateData.userId = null;
    } else {
      const linkedUser = await prisma.user.findUnique({ where: { id: body.userId } });
      if (!canBeRallyCaller(linkedUser)) {
        return errorResponse("Invalid account for caller slot", 400);
      }
      updateData.userId = body.userId;
    }
  }

  await prisma.rallyAssignment.update({
    where: { id: assignmentId },
    data: updateData,
  });

  if (body.userId && event.status === "ACTIVE") {
    const linked = await prisma.rallyAssignment.findUnique({
      where: { id: assignmentId },
      include: { user: true },
    });
    if (linked?.user && linked.launchTime) {
      const firstAssignment = await prisma.rallyAssignment.findFirst({
        where: { rallyEventId: id, launchTime: { not: null } },
        orderBy: { launchTime: "asc" },
      });
      await createNotificationEventsForAssignment(
        linked,
        linked.user,
        event,
        firstAssignment?.id === assignmentId
      );
    }
  }

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
