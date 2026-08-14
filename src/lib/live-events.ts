import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { serializeEvent } from "@/lib/rally-event";
import { LIVE_BOARD_GRACE_MS } from "@/lib/select-active-events";

export {
  mergeLiveBoardEvents,
  mergeActiveEvents,
  selectActiveEvents,
  isLiveOnPublicBoard,
  LIVE_BOARD_GRACE_MS,
} from "@/lib/select-active-events";

const liveInclude = {
  assignments: {
    include: { user: true },
    orderBy: { marchDurationSeconds: "desc" as const },
  },
};

/** Running rallies for the public board — no auth, full caller lists. */
export async function listActivePublicEvents() {
  // These routes do not read cookies, so Next will otherwise statically cache
  // the first empty `{ events: [] }` forever (x-nextjs-cache: HIT).
  noStore();
  const arrivalCutoff = new Date(Date.now() - LIVE_BOARD_GRACE_MS);
  const events = await prisma.rallyEvent.findMany({
    where: {
      OR: [
        { status: "ACTIVE" },
        { status: "COMPLETED", targetArrivalTime: { gte: arrivalCutoff } },
      ],
    },
    include: liveInclude,
    orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
  });
  return events.map(serializeEvent);
}
