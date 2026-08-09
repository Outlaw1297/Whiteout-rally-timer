import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, parseRallyTime } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSessionFromRequest } from "@/lib/session";
import { serializeEvent } from "@/lib/rally-event";
import { DEFAULT_GATHER_SECONDS } from "@/lib/timing";

const eventInclude = {
  assignments: {
    include: { user: true },
    orderBy: { launchTime: "asc" as const },
  },
};

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    const events = await prisma.rallyEvent.findMany({
      where: { status: { in: ["READY", "ACTIVE", "COMPLETED"] } },
      include: eventInclude,
      orderBy: { targetArrivalTime: "asc" },
      take: 50,
    });
    return jsonResponse({ events: events.map(serializeEvent) });
  }

  if (session.role === "ADMIN") {
    const events = await prisma.rallyEvent.findMany({
      where: { status: { not: "CANCELLED" } },
      include: eventInclude,
      orderBy: { targetArrivalTime: "asc" },
      take: 50,
    });
    return jsonResponse({ events: events.map(serializeEvent) });
  }

  const assignments = await prisma.rallyAssignment.findMany({
    where: {
      userId: session.id,
      rallyEvent: { status: { in: ["READY", "ACTIVE", "DRAFT"] } },
    },
    include: {
      rallyEvent: { include: eventInclude },
    },
    orderBy: { launchTime: "asc" },
  });

  const events = assignments.map((a) => {
    const serialized = serializeEvent(a.rallyEvent);
    return {
      ...serialized,
      assignments: serialized.assignments.filter((as) => as.userId === session.id),
    };
  });

  return jsonResponse({ events });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  let body: {
    name?: string;
    targetArrivalTime?: string;
    gatherDurationSeconds?: number;
    isTestMode?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  if (!body.name?.trim()) return errorResponse("name required");
  if (!body.targetArrivalTime) return errorResponse("targetArrivalTime required");

  const targetArrivalTime = parseRallyTime(body.targetArrivalTime);
  if (!targetArrivalTime) return errorResponse("Invalid targetArrivalTime");
  if (targetArrivalTime.getTime() <= Date.now()) {
    return errorResponse("Target arrival must be in the future");
  }

  const gatherDurationSeconds = body.gatherDurationSeconds ?? DEFAULT_GATHER_SECONDS;

  const event = await prisma.rallyEvent.create({
    data: {
      name: body.name.trim(),
      targetArrivalTime,
      gatherDurationSeconds,
      isTestMode: !!body.isTestMode,
      status: "DRAFT",
    },
    include: eventInclude,
  });

  return jsonResponse(serializeEvent(event), 201);
}
