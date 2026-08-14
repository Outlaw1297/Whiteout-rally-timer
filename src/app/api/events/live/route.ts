import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse } from "@/lib/api";
import { serializeEvent } from "@/lib/rally-event";

/**
 * Public list of currently running rallies.
 * Ignores session so callers/admins see the same board as guests.
 */
export async function GET(_request: NextRequest) {
  const events = await prisma.rallyEvent.findMany({
    where: { status: "ACTIVE" },
    include: {
      assignments: {
        include: { user: true },
        orderBy: { marchDurationSeconds: "desc" as const },
      },
    },
    orderBy: { startedAt: "asc" },
  });

  return jsonResponse({ events: events.map(serializeEvent) });
}
