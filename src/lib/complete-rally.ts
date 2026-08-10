import { prisma } from "@/lib/prisma";
import { skipRemainingEventNotifications } from "@/lib/notifications";
import { serializeEvent } from "@/lib/rally-event";
import { allCallersHaveCalled } from "@/lib/caller-launch";
import { broadcastRallyUpdate } from "@/server/rally-hub";
import { logger } from "@/lib/logger";

export { allCallersHaveCalled, callerHasCalled } from "@/lib/caller-launch";

/** Do not complete while THROW is still waiting to send. */
export function shouldDeferRallyCompletion(pendingLaunchCount: number): boolean {
  return pendingLaunchCount > 0;
}

/**
 * Mark an ACTIVE rally COMPLETED once every caller has thrown.
 * Returns true if the rally was completed in this call.
 *
 * Defers while any LAUNCH notification is still PENDING so THROW is never
 * stranded as "overdue" after the rally flips to COMPLETED.
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

  const pendingLaunch = await prisma.notificationEvent.count({
    where: {
      type: "LAUNCH",
      status: "PENDING",
      assignment: { rallyEventId: eventId },
    },
  });

  if (shouldDeferRallyCompletion(pendingLaunch)) {
    logger.info("rally_complete_deferred_pending_launch", {
      eventId,
      pendingLaunch,
      reason,
    });
    return false;
  }

  // Complete + skip remaining non-launch alerts atomically with the status flip.
  const completed = await prisma.$transaction(async (tx) => {
    const claimed = await tx.rallyEvent.updateMany({
      where: { id: eventId, status: "ACTIVE" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (claimed.count === 0) return null;

    await tx.notificationEvent.updateMany({
      where: {
        assignment: { rallyEventId: eventId },
        status: "PENDING",
      },
      data: { status: "SKIPPED", error: reason },
    });

    return tx.rallyEvent.findUnique({
      where: { id: eventId },
      include: {
        assignments: { include: { user: true }, orderBy: { launchTime: "asc" } },
      },
    });
  });

  if (!completed) return false;

  broadcastRallyUpdate(eventId, serializeEvent(completed));
  logger.info("rally_completed", { eventId, reason, name: event.name });
  return true;
}
