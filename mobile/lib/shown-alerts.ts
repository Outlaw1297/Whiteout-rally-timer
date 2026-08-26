import { notificationDedupeKey } from "@whiteout/shared";

/** In-memory dedupe so remote push and local alarms don't both banner. */
const shownUntil = new Map<string, number>();

const DEFAULT_TTL_MS = 180_000;

export function alertDedupeKey(assignmentId: string, type: string): string {
  return notificationDedupeKey(assignmentId, type);
}

export function markAlertShown(assignmentId: string, type: string, ttlMs = DEFAULT_TTL_MS) {
  shownUntil.set(alertDedupeKey(assignmentId, type), Date.now() + ttlMs);
}

export function wasAlertShown(assignmentId: string, type: string): boolean {
  const key = alertDedupeKey(assignmentId, type);
  const until = shownUntil.get(key);
  if (until == null) return false;
  if (Date.now() > until) {
    shownUntil.delete(key);
    return false;
  }
  return true;
}

export function clearAlertShown() {
  shownUntil.clear();
}
