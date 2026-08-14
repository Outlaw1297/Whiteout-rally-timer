export const LIVE_BOARD_GRACE_MS = 15_000;

type LiveBoardEvent = {
  id?: string;
  status: string;
  targetArrivalTime?: string | Date | null;
};

/**
 * Public live board: GO until target arrival.
 * Rallies complete at last throw (~30s after GO with short marches), but
 * gather/march continues until arrival — keep them on the board that whole time.
 */
export function isLiveOnPublicBoard(event: LiveBoardEvent, nowMs = Date.now()): boolean {
  const status = String(event.status).toUpperCase();
  if (status === "ACTIVE") return true;
  if (status !== "COMPLETED") return false;
  if (!event.targetArrivalTime) return false;
  const arrivalMs =
    event.targetArrivalTime instanceof Date
      ? event.targetArrivalTime.getTime()
      : Date.parse(String(event.targetArrivalTime));
  if (!Number.isFinite(arrivalMs)) return false;
  return arrivalMs + LIVE_BOARD_GRACE_MS >= nowMs;
}

export function selectActiveEvents<T extends { status: string }>(events: T[]): T[] {
  return events.filter((e) => String(e.status).toUpperCase() === "ACTIVE");
}

export function selectLiveBoardEvents<T extends LiveBoardEvent>(events: T[], nowMs = Date.now()): T[] {
  return events.filter((e) => isLiveOnPublicBoard(e, nowMs));
}

/** First live row per id, in the order batches were supplied. */
export function mergeLiveBoardEvents<T extends LiveBoardEvent & { id: string }>(
  batches: T[][],
  nowMs = Date.now()
): T[] {
  const byId = new Map<string, T>();
  for (const event of selectLiveBoardEvents(batches.flat(), nowMs)) {
    if (!event.id || byId.has(event.id)) continue;
    byId.set(event.id, event);
  }
  return Array.from(byId.values());
}

/** @deprecated use mergeLiveBoardEvents */
export function mergeActiveEvents<T extends LiveBoardEvent & { id: string }>(
  batches: T[][],
  nowMs = Date.now()
): T[] {
  return mergeLiveBoardEvents(batches, nowMs);
}
