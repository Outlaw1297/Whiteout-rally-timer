import { prisma } from "@/lib/prisma";
import { skipRemainingEventNotifications } from "@/lib/notifications";
import { serializeEvent } from "@/lib/rally-event";
import { allCallersHaveCalled } from "@/lib/caller-launch";
import { broadcastRallyUpdate } from "@/server/rally-hub";
import { logger } from "@/lib/logger";

export { allCallersHaveCalled, callerHasCalled } from "@/lib/caller-launch";

/**
 * Mark an ACTIVE rally COMPLETED once every caller has thrown.
 * Returns true if the rally was completed in this call.
 *
 * Completion is keyed off the last caller throw — not target arrival —
 * so the template can be reset while marches are still inbound.
 */
export async function completeRallyAfterLastCaller(
  eventId: string,
  reason = "last caller launched"
): Promise<boolean> {
  const event = await prisma.rallyEvent.findUnique({
    where: { id: eventId },
    include: { assignments: true },
  });
  if (!event || event.status !== "ACTIVE") return false;
  if (!allCallersHaveCalled(event.assignments, Date.now())) return false;

  // Only one completer wins if tick + confirm race.
  const claimed = await prisma.rallyEvent.updateMany({
    where: { id: eventId, status: "ACTIVE" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  if (claimed.count === 0) return false;

  await skipRemainingEventNotifications(eventId, reason);

  const completed = await prisma.rallyEvent.findUnique({
    where: { id: eventId },
    include: {
      assignments: { include: { user: true }, orderBy: { launchTime: "asc" } },
    },
  });
  if (completed) {
    broadcastRallyUpdate(eventId, serializeEvent(completed));
  }

  logger.info("rally_completed", { eventId, reason, name: event.name });
  return true;
}
