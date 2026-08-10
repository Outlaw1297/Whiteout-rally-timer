import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin, canBeRallyCaller } from "@/lib/auth";
import { serializeEvent } from "@/lib/rally-event";
import { parseMarchDuration } from "@/lib/timing";

interface RouteParams {
  params: { id: string };
}

const eventInclude = {
  assignments: { include: { user: true }, orderBy: { marchDurationSeconds: "desc" as const } },
};

const OFFSET_MIN = -3600;
const OFFSET_MAX = 3600;

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid event ID");

  const event = await prisma.rallyEvent.findUnique({ where: { id } });
  if (!event) return errorResponse("Event not found", 404);
  if (event.status === "CANCELLED" || event.status === "COMPLETED" || event.status === "ACTIVE") {
    return errorResponse("Cannot modify template while rally is running or finished", 400);
  }

  let body: {
    callerName?: string;
    userId?: string;
    marchDuration?: string;
    marchDurationSeconds?: number;
    arrivalOffsetSeconds?: number;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  let marchSeconds = body.marchDurationSeconds;
  if (body.marchDuration) {
    const parsed = parseMarchDuration(body.marchDuration);
    if (parsed === null) return errorResponse("Invalid march duration (use M:SS)");
    marchSeconds = parsed;
  }
  if (!marchSeconds || marchSeconds <= 0) {
    return errorResponse("marchDuration or marchDurationSeconds required");
  }

  let arrivalOffsetSeconds = 0;
  if (body.arrivalOffsetSeconds !== undefined) {
    if (
      typeof body.arrivalOffsetSeconds !== "number" ||
      !Number.isFinite(body.arrivalOffsetSeconds) ||
      body.arrivalOffsetSeconds < OFFSET_MIN ||
      body.arrivalOffsetSeconds > OFFSET_MAX
    ) {
      return errorResponse("arrivalOffsetSeconds must be -3600–3600");
    }
    arrivalOffsetSeconds = Math.floor(body.arrivalOffsetSeconds);
  }

  let callerName = body.callerName?.trim();
  let userId: string | null = body.userId || null;

  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!canBeRallyCaller(user)) {
      return errorResponse("Invalid account for caller slot", 400);
    }
    callerName = callerName || user!.displayName;
  }

  if (!callerName) {
    return errorResponse("callerName required");
  }

  await prisma.rallyAssignment.upsert({
    where: { rallyEventId_callerName: { rallyEventId: id, callerName } },
    create: {
      rallyEventId: id,
      callerName,
      userId,
      marchDurationSeconds: marchSeconds,
      arrivalOffsetSeconds,
    },
    update: {
      userId,
      marchDurationSeconds: marchSeconds,
      arrivalOffsetSeconds,
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
