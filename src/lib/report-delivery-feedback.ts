/** Report when a push was received so per-device lead time can adapt. */
export function reportDeliveryFeedback(payload: {
  targetAt: string;
  receivedAtMs: number;
  assignmentId?: string;
  notificationType?: string;
  rallyId?: string;
}) {
  if (!payload.targetAt) return;

  fetch("/api/push/delivery-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // best-effort learning
  });
}
