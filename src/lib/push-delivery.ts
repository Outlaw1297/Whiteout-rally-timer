import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { createPushReceiptToken, pushFingerprint } from "@/lib/push-receipt";

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

export async function recordPushReceipt(opts: {
  dispatchId: string;
  stage: PushReceiptStage;
  serviceWorkerVersion?: string | null;
  error?: string | null;
}) {
  const now = new Date();
  const common = {
    serviceWorkerVersion: clean(opts.serviceWorkerVersion, 100),
  };
  const data =
    opts.stage === "received"
      ? { ...common, receivedAt: now }
      : opts.stage === "displayed"
        ? { ...common, displayedAt: now, displayFailedAt: null, displayError: null }
        : opts.stage === "display_failed"
          ? { ...common, displayFailedAt: now, displayError: clean(opts.error) }
          : { ...common, clickedAt: now };

  return prisma.pushDeliveryAttempt.updateMany({
    where: { dispatchId: opts.dispatchId },
    data,
  });
}
