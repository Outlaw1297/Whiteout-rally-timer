import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { createPushReceiptToken, pushFingerprint } from "@/lib/push-receipt";
import {
  deliveryLeadCorrectionMs,
  nextDeliveryLeadMs,
  trustedReceiptTime,
} from "@/lib/delivery-lead";
import { syncUserDeliveryLead } from "@/lib/sync-user-delivery-lead";
import { advancePendingNotificationsForUser } from "@/lib/notifications";
import { logger } from "@/lib/logger";

const RETENTION_DAYS = 30;
const MAX_ROWS = 50_000;
let lastPrunedAt = 0;

export interface PushDeliveryContext {
  source: "scheduler" | "user-test" | "developer-test" | "calibration" | "other";
  userId?: string | null;
  username?: string | null;
  displayName?: string | null;
  subscriptionId?: string | null;
  deviceId?: string | null;
  platform?: string | null;
}

export interface PushDeliveryPayloadInfo {
  notificationType?: string | null;
  rallyId?: string | null;
  assignmentId?: string | null;
  targetAt?: string | null;
}

function endpointHost(endpoint: string): string | null {
  try {
    return new URL(endpoint).host;
  } catch {
    return null;
  }
}

function clean(value: unknown, max = 1000): string | null {
  if (value == null) return null;
  return String(value).slice(0, max);
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function pruneIfDue() {
  const now = Date.now();
  if (now - lastPrunedAt < 60 * 60 * 1000) return;
  lastPrunedAt = now;

  const cutoff = new Date(now - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.pushDeliveryAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } });
  const boundary = await prisma.pushDeliveryAttempt.findFirst({
    orderBy: { createdAt: "desc" },
    skip: MAX_ROWS,
    select: { createdAt: true },
  });
  if (boundary) {
    await prisma.pushDeliveryAttempt.deleteMany({
      where: { createdAt: { lte: boundary.createdAt } },
    });
  }
}

export async function createPushDeliveryAttempt(opts: {
  context: PushDeliveryContext;
  payload: PushDeliveryPayloadInfo;
  endpoint: string;
  vapidPublicKey?: string | null;
}) {
  const dispatchId = crypto.randomUUID();
  const receiptToken = createPushReceiptToken(dispatchId);
  await pruneIfDue().catch(() => {});
  await prisma.pushDeliveryAttempt.create({
    data: {
      dispatchId,
      source: opts.context.source,
      userId: opts.context.userId ?? null,
      username: opts.context.username ?? null,
      displayName: opts.context.displayName ?? null,
      subscriptionId: opts.context.subscriptionId ?? null,
      deviceId: opts.context.deviceId ?? null,
      platform: opts.context.platform ?? null,
      endpointHost: endpointHost(opts.endpoint),
      endpointFingerprint: pushFingerprint(opts.endpoint),
      vapidFingerprint: pushFingerprint(opts.vapidPublicKey),
      notificationType: opts.payload.notificationType ?? null,
      rallyId: opts.payload.rallyId ?? null,
      assignmentId: opts.payload.assignmentId ?? null,
      targetAt: parseDate(opts.payload.targetAt),
    },
  });
  return { dispatchId, receiptToken };
}

export async function markPushProviderAccepted(opts: {
  dispatchId: string;
  statusCode?: number;
  messageId?: string | null;
  durationMs: number;
}) {
  await prisma.pushDeliveryAttempt.updateMany({
    where: { dispatchId: opts.dispatchId },
    data: {
      providerStatus: opts.statusCode ?? null,
      providerMessageId: clean(opts.messageId, 255),
      providerDurationMs: opts.durationMs,
      providerAcceptedAt: new Date(),
      providerError: null,
    },
  });
}

export async function markPushProviderFailed(opts: {
  dispatchId: string;
  statusCode?: number;
  error: unknown;
  durationMs: number;
}) {
  await prisma.pushDeliveryAttempt.updateMany({
    where: { dispatchId: opts.dispatchId },
    data: {
      providerStatus: opts.statusCode ?? null,
      providerDurationMs: opts.durationMs,
      providerError: clean(opts.error),
    },
  });
}

export type PushReceiptStage = "received" | "displayed" | "display_failed" | "clicked";

export interface PassiveCalibrationResult {
  applied: boolean;
  duplicate: boolean;
  delayMs?: number;
  roundTripMs?: number;
  correctionMs?: number;
  deliveryLeadMs?: number;
  advancedNotifications?: number;
}

/**
 * Apply at most one timing sample for a dispatch. The signed receipt path uses
 * this without a login cookie; the session feedback path calls the same helper
 * as a fallback, so racing reports cannot double-count one push.
 */
export async function applyPassiveCalibrationForAttempt(opts: {
  dispatchId: string;
  observedAt: Date;
}): Promise<PassiveCalibrationResult> {
  const result = await prisma.$transaction(async (tx) => {
    const attempt = await tx.pushDeliveryAttempt.findUnique({
      where: { dispatchId: opts.dispatchId },
      select: {
        id: true,
        userId: true,
        subscriptionId: true,
        targetAt: true,
        createdAt: true,
        clientReceivedAt: true,
        calibrationAppliedAt: true,
      },
    });

    if (!attempt?.subscriptionId || !attempt.targetAt) {
      return { applied: false, duplicate: false } as const;
    }
    if (attempt.calibrationAppliedAt) {
      return { applied: false, duplicate: true } as const;
    }

    const subscription = await tx.pushSubscription.findFirst({
      where: { id: attempt.subscriptionId, active: true },
      select: {
        id: true,
        userId: true,
        deliveryLeadMs: true,
        deliverySampleCount: true,
      },
    });
    if (!subscription) {
      return { applied: false, duplicate: false } as const;
    }

    const targetObservation = attempt.clientReceivedAt ?? opts.observedAt;
    const observedTargetOffsetMs = Math.round(
      targetObservation.getTime() - attempt.targetAt.getTime()
    );
    const measuredRoundTripMs = Math.max(
      0,
      Math.round(opts.observedAt.getTime() - attempt.createdAt.getTime())
    );
    const claimed = await tx.pushDeliveryAttempt.updateMany({
      where: { id: attempt.id, calibrationAppliedAt: null },
      data: {
        calibrationAppliedAt: new Date(),
        calibrationRoundTripMs: measuredRoundTripMs,
        calibrationDelayMs: observedTargetOffsetMs,
      },
    });
    if (claimed.count === 0) {
      return { applied: false, duplicate: true } as const;
    }

    const correctionMs = deliveryLeadCorrectionMs(
      subscription.deliveryLeadMs,
      measuredRoundTripMs
    );
    const next = nextDeliveryLeadMs(
      subscription.deliveryLeadMs,
      correctionMs,
      subscription.deliverySampleCount
    );
    const calibratedAt = new Date();

    await tx.pushSubscription.update({
      where: { id: subscription.id },
      data: { ...next, lastCalibratedAt: calibratedAt, lastSeenAt: calibratedAt },
    });
    await tx.user.update({
      where: { id: subscription.userId },
      data: { lastSeenAt: calibratedAt },
    });

    return {
      applied: true,
      duplicate: false,
      delayMs: observedTargetOffsetMs,
      roundTripMs: measuredRoundTripMs,
      correctionMs,
      deliveryLeadMs: next.deliveryLeadMs,
      userId: subscription.userId,
    } as const;
  });

  if (!result.applied || !("userId" in result)) return result;

  await syncUserDeliveryLead(result.userId).catch((error) => {
    logger.warn("passive_calibration_user_sync_failed", {
      dispatchId: opts.dispatchId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  const rescheduled = await advancePendingNotificationsForUser(result.userId).catch((error) => {
    logger.warn("passive_calibration_reschedule_failed", {
      dispatchId: opts.dispatchId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { advanced: 0 };
  });

  logger.info("passive_push_calibration", {
    dispatchId: opts.dispatchId,
    delayMs: result.delayMs,
    roundTripMs: result.roundTripMs,
    correctionMs: result.correctionMs,
    deliveryLeadMs: result.deliveryLeadMs,
    advancedNotifications: rescheduled.advanced,
  });

  return { ...result, advancedNotifications: rescheduled.advanced };
}

export async function recordPushReceipt(opts: {
  dispatchId: string;
  stage: PushReceiptStage;
  serviceWorkerVersion?: string | null;
  error?: string | null;
  clientReceivedAtMs?: number | null;
}) {
  const now = new Date();
  const common = {
    serviceWorkerVersion: clean(opts.serviceWorkerVersion, 100),
  };
  const clientReceivedAt =
    opts.stage === "received" ? trustedReceiptTime(opts.clientReceivedAtMs, now) : null;
  const data =
    opts.stage === "received"
      ? { ...common, receivedAt: now, clientReceivedAt }
      : opts.stage === "displayed"
        ? { ...common, displayedAt: now, displayFailedAt: null, displayError: null }
        : opts.stage === "display_failed"
          ? { ...common, displayFailedAt: now, displayError: clean(opts.error) }
          : { ...common, clickedAt: now };

  const updated = await prisma.pushDeliveryAttempt.updateMany({
    where: { dispatchId: opts.dispatchId },
    data,
  });
  if (updated.count === 0 || opts.stage !== "received" || !clientReceivedAt) {
    return { ...updated, calibration: null };
  }

  const calibration = await applyPassiveCalibrationForAttempt({
    dispatchId: opts.dispatchId,
    observedAt: now,
  }).catch((error) => {
    logger.warn("passive_calibration_apply_failed", {
      dispatchId: opts.dispatchId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  return { ...updated, calibration };
}
