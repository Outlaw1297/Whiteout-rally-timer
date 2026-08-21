import type { SerializedEvent } from "./types";

/** Pick the best assigned rally for a caller's home screen. */
export function pickPrimaryCallerEvent(
  events: SerializedEvent[],
  userId: string,
  nowMs: number
): SerializedEvent | null {
  const mine = events
    .map((event) => {
      const assignment = event.assignments.find((a) => a.userId === userId);
      return assignment ? { event, assignment } : null;
    })
    .filter(Boolean) as Array<{
    event: SerializedEvent;
    assignment: SerializedEvent["assignments"][0];
  }>;

  if (mine.length === 0) return null;

  const active = mine.find((m) => m.event.status === "ACTIVE");
  if (active) return active.event;

  const upcoming = mine
    .filter(
      (m) =>
        m.assignment.status === "WAITING" &&
        m.assignment.launchTime &&
        new Date(m.assignment.launchTime).getTime() > nowMs
    )
    .sort(
      (a, b) =>
        new Date(a.assignment.launchTime!).getTime() -
        new Date(b.assignment.launchTime!).getTime()
    );
  if (upcoming[0]) return upcoming[0].event;

  const ready = mine.find(
    (m) => m.event.status === "READY" || m.event.status === "DRAFT"
  );
  if (ready) return ready.event;

  return mine[0].event;
}
