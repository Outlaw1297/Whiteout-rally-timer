const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

export function normalizeDeviceId(value: unknown): string | null {
  if (!isValidDeviceId(value)) return null;
  return value.trim().toLowerCase();
}

export function deviceGroupKey(sub: {
  deviceId?: string | null;
  userAgent?: string | null;
}): string {
  if (sub.deviceId) return `device:${sub.deviceId}`;
  return `ua:${sub.userAgent || "unknown"}`;
}

function recencyMs(sub: { lastSeenAt?: Date | string | null; updatedAt: Date | string }): number {
  const seen = sub.lastSeenAt ? new Date(sub.lastSeenAt).getTime() : 0;
  const updated = new Date(sub.updatedAt).getTime();
  return Math.max(seen, updated);
}

/**
 * One physical phone can mint many Web Push endpoints (iOS re-subscribe on login).
 * Keep the newest row per deviceId, or per user-agent when deviceId is missing.
 */
export function selectCanonicalSubscriptions<
  T extends {
    id: string;
    deviceId?: string | null;
    userAgent?: string | null;
    updatedAt: Date | string;
    lastSeenAt?: Date | string | null;
  }
>(subscriptions: T[]): T[] {
  const byGroup = new Map<string, T>();
  for (const sub of subscriptions) {
    const key = deviceGroupKey(sub);
    const existing = byGroup.get(key);
    if (!existing || recencyMs(sub) >= recencyMs(existing)) {
      byGroup.set(key, sub);
    }
  }
  return Array.from(byGroup.values());
}

export function shortDeviceId(deviceId: string | null | undefined): string | null {
  if (!deviceId) return null;
  return deviceId.slice(0, 8);
}
