import { readStoredDeviceId } from "@/lib/client-device-id";

/**
 * Log out and stop push on THIS install only.
 * Keeps `whiteout-device-id` and the OS push subscription so the same phone
 * reattaches on the next login without minting a new iOS endpoint.
 */
export async function logoutAndUnbindThisDevice(): Promise<void> {
  const deviceId = readStoredDeviceId();
  let endpoint: string | undefined;

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      endpoint = subscription?.endpoint;
    }
  } catch {
    /* still log out even if push lookup fails */
  }

  await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ endpoint, deviceId }),
  });
}
