import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAuth, requireAdmin, canBeRallyCaller } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { serializeEvent } from "@/lib/rally-event";
import { parseMarchDuration } from "@/lib/timing";
import { createNotificationEventsForAssignment } from "@/lib/notifications";

interface RouteParams {
  params: { id: string; assignmentId: string };
}

const OFFSET_MIN = -3600;
const OFFSET_MAX = 3600;

const eventInclude = {
  assignments: { include: { user: true }, orderBy: { marchDurationSeconds: "desc" as const } },
};

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await requireAuth(request);
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
    arrivalOffsetSeconds?: number;
    callerName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  const isAdmin = isAdminRole(session.role);
  const isOwnAssignment = assignment.userId === session.id;

  // Callers may only edit their own march when the template is not running.
  if (!isAdmin) {
    if (!isOwnAssignment) return errorResponse("Forbidden", 403);
    if (
      body.userId !== undefined ||
      body.arrivalOffsetSeconds !== undefined ||
      body.callerName !== undefined
    ) {
      return errorResponse("Callers can only update their own march time", 403);
    }
    if (body.marchDuration === undefined && body.marchDurationSeconds === undefined) {
      return errorResponse("marchDuration required");
    }
  }

  if (
    event.status === "ACTIVE" &&
    (body.marchDuration !== undefined ||
      body.marchDurationSeconds !== undefined ||
      body.arrivalOffsetSeconds !== undefined ||
      body.callerName !== undefined)
  ) {
    return errorResponse("Cannot edit march/offset while rally is running", 400);
  }

  let marchSeconds = body.marchDurationSeconds;
  if (body.marchDuration) {
    const parsed = parseMarchDuration(body.marchDuration);
    if (parsed === null) return errorResponse("Invalid march duration");
    marchSeconds = parsed;
  }
  if (
    !marchSeconds &&
    body.userId === undefined &&
    body.arrivalOffsetSeconds === undefined &&
    body.callerName === undefined
  ) {
    return errorResponse("marchDuration, arrivalOffsetSeconds, callerName, or userId required");
  }

  const updateData: {
    marchDurationSeconds?: number;
    userId?: string | null;
    arrivalOffsetSeconds?: number;
    callerName?: string;
  } = {};

  if (marchSeconds) updateData.marchDurationSeconds = marchSeconds;
  if (body.arrivalOffsetSeconds !== undefined) {
    if (
      typeof body.arrivalOffsetSeconds !== "number" ||
      !Number.isFinite(body.arrivalOffsetSeconds) ||
      body.arrivalOffsetSeconds < OFFSET_MIN ||
      body.arrivalOffsetSeconds > OFFSET_MAX
    ) {
      return errorResponse("arrivalOffsetSeconds must be -3600–3600");
    }
    updateData.arrivalOffsetSeconds = Math.floor(body.arrivalOffsetSeconds);
  }
  if (body.callerName !== undefined) {
    const name = body.callerName.trim();
    if (!name) return errorResponse("callerName cannot be empty");
    updateData.callerName = name;
  }
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

  try {
    await prisma.rallyAssignment.update({
      where: { id: assignmentId },
      data: updateData,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Unique constraint") || message.includes("callerName")) {
      return errorResponse("A caller with that name already exists on this template", 409);
    }
    throw err;
  }

  if (body.userId && event.status === "ACTIVE") {
    const linked = await prisma.rallyAssignment.findUnique({
      where: { id: assignmentId },
      include: { user: true },
    });
    if (linked?.user && linked.launchTime) {
      await createNotificationEventsForAssignment(linked, linked.user, event);
    }
  }

  const updated = await prisma.rallyEvent.findUnique({
    where: { id },
    include: eventInclude,
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
    include: eventInclude,
  });

  return jsonResponse(serializeEvent(updated!));
}
