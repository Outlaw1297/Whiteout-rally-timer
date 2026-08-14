import { prisma } from "@/lib/prisma";
import { serializeEvent } from "@/lib/rally-event";

const liveInclude = {
  assignments: {
    include: { user: true },
    orderBy: { marchDurationSeconds: "desc" as const },
  },
};

/** Running rallies for the public board — no auth, full caller lists. */
export async function listActivePublicEvents() {
  const events = await prisma.rallyEvent.findMany({
    where: { status: "ACTIVE" },
    include: liveInclude,
    orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
  });
  return events.map(serializeEvent);
}

export function selectActiveEvents<T extends { status: string }>(events: T[]): T[] {
  return events.filter((e) => String(e.status).toUpperCase() === "ACTIVE");
}
