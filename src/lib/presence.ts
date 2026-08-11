/** Consider online if a presence/live ping was seen within this window. */
export const ONLINE_THRESHOLD_MS = 5 * 60_000;

export function isOnline(lastSeenAt: Date | string | null | undefined, nowMs = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const ms = typeof lastSeenAt === "string" ? Date.parse(lastSeenAt) : lastSeenAt.getTime();
  if (!Number.isFinite(ms)) return false;
  return nowMs - ms <= ONLINE_THRESHOLD_MS;
}

export function presenceLabel(online: boolean): "Online" | "Offline" {
  return online ? "Online" : "Offline";
}
