import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { serializeEvent } from "@/lib/rally-event";
import { resetEventToTemplate } from "@/lib/notifications";
import { broadcastRallyUpdate } from "@/server/rally-hub";

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

  const event = await prisma.rallyEvent.findUnique({ where: { id } });
  if (!event) return errorResponse("Event not found", 404);
  if (event.status === "CANCELLED") {
    return errorResponse("Cannot reset a cancelled rally", 400);
  }
  if (event.status === "DRAFT" || event.status === "READY") {
    return errorResponse("Template is not running — edit it directly", 400);
  }

  await resetEventToTemplate(id);

  const updated = await prisma.rallyEvent.findUnique({
    where: { id },
    include: eventInclude,
  });

  const payload = serializeEvent(updated!);
  broadcastRallyUpdate(id, payload);

  return jsonResponse({ event: payload });
}
