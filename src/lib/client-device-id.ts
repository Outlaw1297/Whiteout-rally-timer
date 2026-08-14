import { isValidDeviceId } from "@/lib/device-id";

export const DEVICE_ID_STORAGE_KEY = "whiteout-device-id";

/** Read the install id without minting a new one (logout / diagnostics). */
export function readStoredDeviceId(): string | null {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && isValidDeviceId(existing)) return existing.toLowerCase();
  } catch {
    /* private mode / blocked storage */
  }
  return null;
}

/** Stable per-install id. Survives login; lost only if the user clears site data. */
export function getOrCreateDeviceId(): string {
  try {
    const existing = readStoredDeviceId();
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
