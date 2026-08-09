import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { recalculateAssignmentTimes, serializeEvent } from "@/lib/rally-event";
import { parseMarchDuration } from "@/lib/timing";

interface RouteParams {
  params: { id: string };
}

const eventInclude = {
  assignments: { include: { user: true }, orderBy: { launchTime: "asc" as const } },
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid event ID");

  const event = await prisma.rallyEvent.findUnique({ where: { id } });
  if (!event) return errorResponse("Event not found", 404);
  if (event.status === "CANCELLED" || event.status === "COMPLETED") {
    return errorResponse("Cannot modify assignments", 400);
  }

  let body: { userId?: string; marchDuration?: string; marchDurationSeconds?: number };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  if (!body.userId) return errorResponse("userId required");

  let marchSeconds = body.marchDurationSeconds;
  if (body.marchDuration) {
    const parsed = parseMarchDuration(body.marchDuration);
    if (parsed === null) return errorResponse("Invalid march duration (use M:SS)");
    marchSeconds = parsed;
  }
  if (!marchSeconds || marchSeconds <= 0) {
    return errorResponse("marchDuration or marchDurationSeconds required");
  }

  const user = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!user || user.role !== "CALLER" || !user.active) {
    return errorResponse("Invalid caller", 400);
  }

  const { launchTime, expectedArrivalTime } = recalculateAssignmentTimes(
    event.targetArrivalTime,
    event.gatherDurationSeconds,
    marchSeconds
  );

  await prisma.rallyAssignment.upsert({
    where: { rallyEventId_userId: { rallyEventId: id, userId: body.userId } },
    create: {
      rallyEventId: id,
      userId: body.userId,
      marchDurationSeconds: marchSeconds,
      launchTime,
      expectedArrivalTime,
    },
    update: {
      marchDurationSeconds: marchSeconds,
      launchTime,
      expectedArrivalTime,
      status: "WAITING",
      launchedConfirmedAt: null,
    },
  });

  const updated = await prisma.rallyEvent.findUnique({
    where: { id },
    include: eventInclude,
  });

  if (updated && updated.assignments.length > 0 && updated.status === "DRAFT") {
    await prisma.rallyEvent.update({ where: { id }, data: { status: "READY" } });
    updated.status = "READY";
  }

  return jsonResponse(serializeEvent(updated!), 201);
}
