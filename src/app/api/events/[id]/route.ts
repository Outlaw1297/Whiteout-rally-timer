import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid, parseRallyTime } from "@/lib/api";
import { requireAdmin, requireAuth } from "@/lib/auth";
import { getSessionFromRequest } from "@/lib/session";
import {
  serializeEvent,
  serializeNotificationMonitor,
  recalculateAssignmentTimes,
} from "@/lib/rally-event";
import { rescheduleEventNotifications } from "@/lib/notifications";
import { broadcastRallyUpdate, broadcastRallyCancelled } from "@/server/rally-hub";
import { DEFAULT_GATHER_SECONDS } from "@/lib/timing";

interface RouteParams {
  params: { id: string };
}

const eventInclude = {
  assignments: {
    include: {
      user: { include: { pushSubscriptions: { where: { active: true } } } },
    },
    orderBy: { launchTime: "asc" as const },
  },
};

const eventIncludeBasic = {
  assignments: { include: { user: true }, orderBy: { launchTime: "asc" as const } },
};

async function getEventForUser(eventId: string, userId: string, role: string) {
  const event = await prisma.rallyEvent.findUnique({
    where: { id: eventId },
    include: eventIncludeBasic,
  });
  if (!event) return null;
  if (role === "ADMIN") return event;
  const assigned = event.assignments.some((a) => a.userId === userId);
  return assigned ? event : null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getSessionFromRequest(request);

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid event ID");

  if (!session) {
    const event = await prisma.rallyEvent.findUnique({
      where: { id },
      include: eventIncludeBasic,
    });
    if (!event || event.status === "CANCELLED" || event.status === "DRAFT") {
      return errorResponse("Event not found", 404);
    }
    return jsonResponse(serializeEvent(event));
  }

  const event = await getEventForUser(id, session.id, session.role);
  if (!event) return errorResponse("Event not found", 404);

  let payload = serializeEvent(event);

  if (session.role !== "ADMIN") {
    payload = {
      ...payload,
      assignments: payload.assignments.filter((a) => a.userId === session.id),
    };
  }

  if (session.role === "ADMIN") {
    const full = await prisma.rallyEvent.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            user: { include: { pushSubscriptions: true } },
            notificationEvents: { orderBy: { scheduledAt: "asc" } },
          },
          orderBy: { launchTime: "asc" },
        },
      },
    });
    if (full) {
      return jsonResponse({
        ...payload,
        notificationMonitor: full.assignments.map((a) =>
          serializeNotificationMonitor(a, full.name)
        ),
      });
    }
  }

  return jsonResponse(payload);
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid event ID");

  const event = await prisma.rallyEvent.findUnique({
    where: { id },
    include: eventIncludeBasic,
  });
  if (!event) return errorResponse("Event not found", 404);
  if (event.status === "CANCELLED" || event.status === "COMPLETED") {
    return errorResponse("Cannot edit this event", 400);
  }

  let body: {
    name?: string;
    targetArrivalTime?: string;
    gatherDurationSeconds?: number;
    status?: "DRAFT" | "READY";
    reschedule?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  const isActiveEdit = event.status === "ACTIVE";
  if (isActiveEdit && !body.reschedule) {
    return errorResponse(
      "Active event requires reschedule:true to modify timing",
      409
    );
  }

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name.trim();
  if (body.gatherDurationSeconds !== undefined) {
    updateData.gatherDurationSeconds = body.gatherDurationSeconds;
  }
  if (body.targetArrivalTime !== undefined) {
    const t = parseRallyTime(body.targetArrivalTime);
    if (!t) return errorResponse("Invalid targetArrivalTime");
    updateData.targetArrivalTime = t;
  }
  if (body.status !== undefined && !isActiveEdit) {
    updateData.status = body.status;
  }

  const updated = await prisma.rallyEvent.update({
    where: { id },
    data: updateData,
    include: eventIncludeBasic,
  });

  const gather = updated.gatherDurationSeconds;
  const target = updated.targetArrivalTime;

  for (const assignment of updated.assignments) {
    const times = recalculateAssignmentTimes(
      target,
      gather,
      assignment.marchDurationSeconds
    );
    await prisma.rallyAssignment.update({
      where: { id: assignment.id },
      data: times,
    });
  }

  if (isActiveEdit && body.reschedule) {
    await rescheduleEventNotifications(id);
  }

  const final = await prisma.rallyEvent.findUnique({
    where: { id },
    include: eventIncludeBasic,
  });

  const payload = serializeEvent(final!);
  broadcastRallyUpdate(id, payload);
  return jsonResponse(payload);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid event ID");

  await prisma.rallyEvent.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  broadcastRallyCancelled(id);
  return jsonResponse({ success: true, id });
}
