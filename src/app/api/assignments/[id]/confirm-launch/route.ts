import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { completeRallyAfterLastCaller } from "@/lib/complete-rally";
import { serializeEvent } from "@/lib/rally-event";
import { broadcastRallyUpdate } from "@/server/rally-hub";

interface RouteParams {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid assignment ID");

  const assignment = await prisma.rallyAssignment.findUnique({
    where: { id },
    include: { rallyEvent: true },
  });

  if (!assignment) return errorResponse("Assignment not found", 404);
  if (assignment.userId !== session.id && session.role !== "ADMIN" && session.role !== "DEVELOPER") {
    return errorResponse("Forbidden", 403);
  }

  await prisma.rallyAssignment.update({
    where: { id },
    data: { status: "LAUNCHED", launchedConfirmedAt: new Date() },
  });

  // If this was the last caller to confirm, end the rally immediately
  // instead of waiting for target arrival.
  await completeRallyAfterLastCaller(
    assignment.rallyEventId,
    "last caller confirmed launch"
  );

  const event = await prisma.rallyEvent.findUnique({
    where: { id: assignment.rallyEventId },
    include: {
      assignments: { include: { user: true }, orderBy: { launchTime: "asc" } },
    },
  });
  if (event && event.status === "ACTIVE") {
    broadcastRallyUpdate(event.id, serializeEvent(event));
  }

  return jsonResponse({
    success: true,
    launchedConfirmedAt: new Date().toISOString(),
    launchTime: assignment.launchTime?.toISOString() ?? null,
    expectedArrivalTime: assignment.expectedArrivalTime?.toISOString() ?? null,
    eventStatus: event?.status ?? null,
  });
}
