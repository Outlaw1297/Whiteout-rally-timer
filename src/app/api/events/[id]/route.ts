import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSessionFromRequest } from "@/lib/session";
import { isAdminRole } from "@/lib/roles";
import {
  serializeEvent,
  serializeNotificationMonitor,
} from "@/lib/rally-event";
import { cancelAllEventNotifications } from "@/lib/notifications";
import { broadcastRallyUpdate, broadcastRallyCancelled } from "@/server/rally-hub";

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
  if (isAdminRole(role)) return event;
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

  if (!isAdminRole(session.role)) {
    payload = {
      ...payload,
      assignments: payload.assignments.filter((a) => a.userId === session.id),
    };
  }

  if (isAdminRole(session.role)) {
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
  if (event.status === "CANCELLED") {
    return errorResponse("Cannot edit this event", 400);
  }

  let body: {
    name?: string;
    gatherDurationSeconds?: number;
    firstCallerLeadSeconds?: number;
    pushLeadMs?: number;
    pinned?: boolean;
    sortOrder?: number;
    status?: "DRAFT" | "READY";
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  const isPinOnly =
    (body.pinned !== undefined || body.sortOrder !== undefined) &&
    body.name === undefined &&
    body.gatherDurationSeconds === undefined &&
    body.firstCallerLeadSeconds === undefined &&
    body.pushLeadMs === undefined &&
    body.status === undefined;

  if (!isPinOnly) {
    if (event.status === "COMPLETED") {
      return errorResponse("Cannot edit this event", 400);
    }
    if (event.status === "ACTIVE") {
      return errorResponse("Cannot edit template while rally is running", 400);
    }
  }

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name.trim();
  if (body.gatherDurationSeconds !== undefined) {
    updateData.gatherDurationSeconds = body.gatherDurationSeconds;
  }
  if (body.firstCallerLeadSeconds !== undefined) {
    if (body.firstCallerLeadSeconds < 0 || body.firstCallerLeadSeconds > 300) {
      return errorResponse("firstCallerLeadSeconds must be 0–300");
    }
    updateData.firstCallerLeadSeconds = body.firstCallerLeadSeconds;
  }
  if (body.pushLeadMs !== undefined) {
    if (body.pushLeadMs < 0 || body.pushLeadMs > 8000) {
      return errorResponse("pushLeadMs must be 0–8000");
    }
    updateData.pushLeadMs = body.pushLeadMs;
  }
  if (body.pinned !== undefined) updateData.pinned = !!body.pinned;
  if (body.sortOrder !== undefined) {
    if (typeof body.sortOrder !== "number" || !Number.isFinite(body.sortOrder)) {
      return errorResponse("sortOrder must be a number");
    }
    updateData.sortOrder = Math.floor(body.sortOrder);
  }
  if (body.status !== undefined) {
    updateData.status = body.status;
  }

  const updated = await prisma.rallyEvent.update({
    where: { id },
    data: updateData,
    include: eventIncludeBasic,
  });

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

  const event = await prisma.rallyEvent.findUnique({ where: { id } });
  if (!event) return errorResponse("Event not found", 404);

  const hard = request.nextUrl.searchParams.get("hard") === "true";

  if (event.status === "ACTIVE") {
    await cancelAllEventNotifications(id);
  }

  if (hard && event.status !== "ACTIVE") {
    await prisma.rallyEvent.delete({ where: { id } });
    broadcastRallyCancelled(id);
    return jsonResponse({ success: true, id, deleted: true });
  }

  await prisma.rallyEvent.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  broadcastRallyCancelled(id);
  return jsonResponse({ success: true, id });
}
