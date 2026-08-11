/**
 * Per-browser device onboarding — shown once after first login on a new device.
 * Keyed by user id so account switches still get a fresh walkthrough when needed.
 */

export const ONBOARDING_VERSION = 1;
const STORAGE_PREFIX = "rally-device-onboarding-v";

export type OnboardingRecord = {
  version: number;
  completedAt: string;
  userId: string;
};

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${ONBOARDING_VERSION}:${userId}`;
}

export function hasCompletedDeviceOnboarding(userId: string | null | undefined): boolean {
  if (!userId || typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as OnboardingRecord;
    return parsed?.version === ONBOARDING_VERSION && parsed.userId === userId;
  } catch {
    return false;
  }
}

export function markDeviceOnboardingComplete(userId: string): void {
  if (typeof window === "undefined") return;
  const record: OnboardingRecord = {
    version: ONBOARDING_VERSION,
    completedAt: new Date().toISOString(),
    userId,
  };
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(record));
  } catch {
    /* ignore quota */
  }
}

export function clearDeviceOnboarding(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}

/** Restart walkthrough — clears completion for this user on this browser. */
export function restartDeviceOnboarding(userId: string): void {
  clearDeviceOnboarding(userId);
}

export function shouldOfferDeviceOnboarding(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return !hasCompletedDeviceOnboarding(userId);
}
