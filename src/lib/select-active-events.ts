export function selectActiveEvents<T extends { status: string }>(events: T[]): T[] {
  return events.filter((e) => String(e.status).toUpperCase() === "ACTIVE");
}

/** First ACTIVE row per id, in the order batches were supplied. */
export function mergeActiveEvents<T extends { id: string; status: string }>(
  batches: T[][]
): T[] {
  const byId = new Map<string, T>();
  for (const event of selectActiveEvents(batches.flat())) {
    if (!event.id || byId.has(event.id)) continue;
    byId.set(event.id, event);
  }
  return Array.from(byId.values());
}
