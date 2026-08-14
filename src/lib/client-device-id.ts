import { isValidDeviceId } from "@/lib/device-id";

export const DEVICE_ID_STORAGE_KEY = "whiteout-device-id";

/** Stable per-install id. Survives login; lost only if the user clears site data. */
export function getOrCreateDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && isValidDeviceId(existing)) return existing.toLowerCase();
    const id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
