import { DEFAULT_PUSH_LEAD_MS } from "./timing";

export const MIN_DELIVERY_LEAD_MS = 0;
export const MAX_DELIVERY_LEAD_MS = 8000;
/** Lower alpha = more stable rolling average; resists single bad samples. */
const EMA_ALPHA = 0.18;
/** Cap how far one sample can move the learned lead (ms). */
const MAX_STEP_MS = 400;
/** Ignore extreme outliers beyond this delay magnitude (ms). */
const OUTLIER_ABS_MS = 12_000;

/**
 * Positive delayMs means the notification arrived late vs the target moment.
 * Blend toward a higher lead with a capped EMA so noisy samples don't overload the estimate.
 */
export function nextDeliveryLeadMs(
  currentLead: number,
  delayMs: number,
  sampleCount: number
): { deliveryLeadMs: number; deliverySampleCount: number } {
  const clampedDelay = Math.max(-OUTLIER_ABS_MS, Math.min(OUTLIER_ABS_MS, delayMs));
  const desired = Math.max(
    MIN_DELIVERY_LEAD_MS,
    Math.min(MAX_DELIVERY_LEAD_MS, currentLead + clampedDelay)
  );

  if (sampleCount <= 0) {
    return { deliveryLeadMs: desired, deliverySampleCount: 1 };
  }

  // Shrink learning rate as more samples accumulate (rolling average stability).
  const alpha = Math.max(0.08, EMA_ALPHA / Math.sqrt(Math.min(sampleCount, 25)));
  let blended = Math.round(currentLead * (1 - alpha) + desired * alpha);

  // Hard cap per-sample movement so a single late/early spike can't jump the lead.
  const delta = blended - currentLead;
  if (Math.abs(delta) > MAX_STEP_MS) {
    blended = currentLead + Math.sign(delta) * MAX_STEP_MS;
  }

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

/** Return an earlier pending send time, or null when the current time is already safer. */
export function nextEarlierScheduleMs(
  currentScheduledMs: number,
  targetMs: number,
  deliveryLeadMs: number,
  nowMs: number
): number | null {
  const desiredMs = Math.max(nowMs, targetMs - Math.max(0, deliveryLeadMs));
  return desiredMs < currentScheduledMs ? desiredMs : null;
}

/** Prefer a device receipt timestamp only when its wall clock is plausibly aligned. */
export function trustedReceiptTime(clientReceivedAtMs: unknown, serverReceivedAt: Date): Date {
  const clientMs = Number(clientReceivedAtMs);
  if (!Number.isFinite(clientMs)) return serverReceivedAt;
  const maxClockSkewMs = 5_000;
  if (Math.abs(clientMs - serverReceivedAt.getTime()) > maxClockSkewMs) {
    return serverReceivedAt;
  }
  return new Date(clientMs);
}

/** Convert a measured signed-receipt round trip into the correction for the current lead. */
export function deliveryLeadCorrectionMs(
  currentLeadMs: number,
  measuredRoundTripMs: number
): number {
  return measuredRoundTripMs - currentLeadMs;
}
