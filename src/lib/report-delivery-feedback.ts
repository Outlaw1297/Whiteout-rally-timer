import { getOrCreateDeviceId } from "@/lib/client-device-id";

/** Report when a push was received so per-device lead time can adapt. */
export function reportDeliveryFeedback(payload: {
  targetAt: string;
  receivedAtMs: number;
  assignmentId?: string;
  notificationType?: string;
  rallyId?: string;
  endpoint?: string;
  dispatchId?: string;
}) {
  if (!payload.targetAt) return;

  let deviceId: string | undefined;
  try {
    deviceId = getOrCreateDeviceId();
  } catch {
    deviceId = undefined;
  }

  fetch("/api/push/delivery-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ...payload, deviceId }),
    keepalive: true,
  }).catch(() => {
    // best-effort learning
  });
}
