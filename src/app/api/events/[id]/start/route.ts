import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { serializeEvent } from "@/lib/rally-event";
import { activateEventNotifications } from "@/lib/notifications";
import { broadcastRallyUpdate } from "@/server/rally-hub";

interface RouteParams {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid event ID");

  const event = await prisma.rallyEvent.findUnique({
    where: { id },
    include: {
      assignments: { include: { user: true }, orderBy: { launchTime: "asc" } },
    },
  });

  if (!event) return errorResponse("Event not found", 404);
  if (event.status === "CANCELLED" || event.status === "COMPLETED") {
    return errorResponse("Cannot start this event", 400);
  }
  if (event.assignments.length === 0) {
    return errorResponse("Add at least one caller before starting", 400);
  }

  const updated = await prisma.rallyEvent.update({
    where: { id },
    data: { status: "ACTIVE", startedAt: new Date() },
    include: {
      assignments: { include: { user: true }, orderBy: { launchTime: "asc" } },
    },
  });

  await activateEventNotifications(id);

  const payload = serializeEvent(updated);
  broadcastRallyUpdate(id, payload);

  return jsonResponse({ event: payload });
}
