import { DEFAULT_PUSH_LEAD_MS } from "./timing";

export const MIN_DELIVERY_LEAD_MS = 0;
export const MAX_DELIVERY_LEAD_MS = 8000;
const EMA_ALPHA = 0.35;

/**
 * Positive delayMs means the notification arrived late vs the target moment.
 * Blend toward a higher lead time so the next send arrives closer to target.
 */
export function nextDeliveryLeadMs(
  currentLead: number,
  delayMs: number,
  sampleCount: number
): { deliveryLeadMs: number; deliverySampleCount: number } {
  const desired = Math.max(
    MIN_DELIVERY_LEAD_MS,
    Math.min(MAX_DELIVERY_LEAD_MS, currentLead + delayMs)
  );

  if (sampleCount <= 0) {
    return { deliveryLeadMs: desired, deliverySampleCount: 1 };
  }

  const blended = Math.round(currentLead * (1 - EMA_ALPHA) + desired * EMA_ALPHA);
  return {
    deliveryLeadMs: Math.max(MIN_DELIVERY_LEAD_MS, Math.min(MAX_DELIVERY_LEAD_MS, blended)),
    deliverySampleCount: sampleCount + 1,
  };
}

export function getEffectivePushLeadMs(
  eventPushLeadMs: number,
  subscriptions: Array<{ deliveryLeadMs: number }>
): number {
  if (subscriptions.length === 0) return eventPushLeadMs;
  const deviceMax = Math.max(...subscriptions.map((s) => s.deliveryLeadMs));
  return Math.max(eventPushLeadMs, deviceMax);
}

export function defaultDeliveryLeadMs(
  eventPushLeadMs = DEFAULT_PUSH_LEAD_MS,
  platform?: string | null
): number {
  const base = Math.max(MIN_DELIVERY_LEAD_MS, Math.min(MAX_DELIVERY_LEAD_MS, eventPushLeadMs));
  // Pixel/Android Chrome often buffers pushes in Doze — start with more lead.
  if (platform && /android|pixel/i.test(platform)) {
    return Math.max(base, 3000);
  }
  return base;
}
