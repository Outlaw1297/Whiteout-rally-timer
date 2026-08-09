import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSessionFromRequest } from "@/lib/session";
import { serializeEvent } from "@/lib/rally-event";
import { DEFAULT_GATHER_SECONDS } from "@/lib/timing";

const eventInclude = {
  assignments: {
    include: { user: true },
    orderBy: { marchDurationSeconds: "desc" as const },
  },
};

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    const events = await prisma.rallyEvent.findMany({
      where: { status: { in: ["ACTIVE", "COMPLETED"] } },
      include: eventInclude,
      orderBy: { startedAt: "desc" },
      take: 50,
    });
    return jsonResponse({ events: events.map(serializeEvent) });
  }

  if (session.role === "ADMIN") {
    const events = await prisma.rallyEvent.findMany({
      where: { status: { not: "CANCELLED" } },
      include: eventInclude,
      orderBy: { createdAt: "desc" },
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
    gatherDurationSeconds?: number;
    isTestMode?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  if (!body.name?.trim()) return errorResponse("name required");

  const gatherDurationSeconds = body.gatherDurationSeconds ?? DEFAULT_GATHER_SECONDS;

  const event = await prisma.rallyEvent.create({
    data: {
      name: body.name.trim(),
      gatherDurationSeconds,
      isTestMode: !!body.isTestMode,
      status: "DRAFT",
    },
    include: eventInclude,
  });

  return jsonResponse(serializeEvent(event), 201);
}
