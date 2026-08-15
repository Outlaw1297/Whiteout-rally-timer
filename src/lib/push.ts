import webpush from "web-push";
import crypto from "crypto";
import { prisma } from "./prisma";
import { logger } from "./logger";
import {
  createPushDeliveryAttempt,
  markPushProviderAccepted,
  markPushProviderFailed,
  type PushDeliveryContext,
} from "./push-delivery";

const CONFIG_ID = "default";

let initialized = false;
let activePublicKey: string | null = null;
let lastInitError: string | null = null;
let initPromise: Promise<boolean> | null = null;
let keySource: "env" | "database" | "generated" | null = null;

/** Strip quotes, accidental key prefixes, and base64 padding from env values. */
export function normalizeVapidKey(key: string | undefined): string | null {
  if (!key) return null;

  let normalized = key.trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  normalized = normalized.replace(/^VAPID_(PUBLIC|PRIVATE)_KEY=/i, "").trim();
  normalized = normalized.replace(/\s+/g, "");
  normalized = normalized.replace(/=+$/, "");

  return normalized || null;
}

function getSubject(): string {
  return (process.env.VAPID_SUBJECT || "mailto:admin@example.com").trim();
}

function isPlausibleVapidKey(key: string): boolean {
  return key.length >= 40 && /^[A-Za-z0-9_-]+$/.test(key);
}

function urlBase64ToBuffer(base64: string): Buffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Verify public/private VAPID keys are a matching ECDH P-256 pair. */
export function validateVapidKeyPair(publicKey: string, privateKey: string): boolean {
  try {
    const publicKeyBuffer = urlBase64ToBuffer(publicKey);
    const privateKeyBuffer = urlBase64ToBuffer(privateKey);

    if (publicKeyBuffer.length !== 65 || publicKeyBuffer[0] !== 0x04) return false;
    if (privateKeyBuffer.length !== 32) return false;

    const ecdh = crypto.createECDH("prime256v1");
    ecdh.setPrivateKey(privateKeyBuffer);
    const derivedPublic = ecdh.getPublicKey();

    return publicKeyBuffer.equals(derivedPublic);
  } catch {
    return false;
  }
}

function trySetVapid(subject: string, publicKey: string, privateKey: string): boolean {
  if (!isPlausibleVapidKey(publicKey) || !isPlausibleVapidKey(privateKey)) {
    return false;
  }

  if (!validateVapidKeyPair(publicKey, privateKey)) {
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return true;
  } catch {
    return false;
  }
}

function markReady(
  publicKey: string,
  source: "env" | "database" | "generated"
): boolean {
  initialized = true;
  activePublicKey = publicKey;
  keySource = source;
  lastInitError = null;
  return true;
}

async function loadFromDatabase(): Promise<{
  publicKey: string;
  privateKey: string;
  subject: string;
  source: string;
} | null> {
  const row = await prisma.vapidConfig.findUnique({ where: { id: CONFIG_ID } });
  if (!row) return null;
  return {
    publicKey: row.publicKey,
    privateKey: row.privateKey,
    subject: row.subject,
    source: row.source,
  };
}

async function saveToDatabase(
  publicKey: string,
  privateKey: string,
  subject: string,
  source: "env" | "database" | "generated"
) {
  await prisma.vapidConfig.upsert({
    where: { id: CONFIG_ID },
    create: { id: CONFIG_ID, publicKey, privateKey, subject, source },
    update: { publicKey, privateKey, subject, source },
  });
}

async function generateAndStore(subject: string) {
  const keys = webpush.generateVAPIDKeys();
  await saveToDatabase(keys.publicKey, keys.privateKey, subject, "generated");
  console.log(
    JSON.stringify({
      event: "vapid_auto_generated",
      message: "Created new VAPID key pair and saved to database",
    })
  );
  return keys;
}

async function clearStoredKeys() {
  await prisma.vapidConfig.deleteMany({ where: { id: CONFIG_ID } });
}

async function invalidateAllSubscriptions(reason: string) {
  const result = await prisma.pushSubscription.updateMany({
    where: { active: true },
    data: { active: false },
  });
  if (result.count > 0) {
    console.log(
      JSON.stringify({
        event: "push_subscriptions_invalidated",
        count: result.count,
        reason,
      })
    );
  }
}

async function resolveVapidKeys(): Promise<boolean> {
  const subject = getSubject();

  const stored = await loadFromDatabase();
  if (stored) {
    if (trySetVapid(stored.subject, stored.publicKey, stored.privateKey)) {
      const source =
        stored.source === "env" || stored.source === "generated"
          ? stored.source
          : "database";
      return markReady(stored.publicKey, source);
    }

    console.warn(
      JSON.stringify({
        event: "vapid_stored_invalid",
        message: "Stored VAPID keys are invalid or mismatched — regenerating",
        previousSource: stored.source,
      })
    );
    await clearStoredKeys();
    await invalidateAllSubscriptions("vapid_keys_regenerated");
  }

  const envPublic = normalizeVapidKey(process.env.VAPID_PUBLIC_KEY);
  const envPrivate = normalizeVapidKey(process.env.VAPID_PRIVATE_KEY);
  if (envPublic && envPrivate && trySetVapid(subject, envPublic, envPrivate)) {
    await saveToDatabase(envPublic, envPrivate, subject, "env");
    console.log(
      JSON.stringify({
        event: "vapid_from_env",
        message: "Using validated VAPID keys from environment variables",
      })
    );
    return markReady(envPublic, "env");
  }

  if (envPublic || envPrivate) {
    console.warn(
      JSON.stringify({
        event: "vapid_env_ignored",
        message:
          "Invalid or mismatched VAPID env vars ignored — auto-generating keys instead",
      })
    );
    await invalidateAllSubscriptions("vapid_env_invalid");
  }

  const generated = await generateAndStore(subject);
  if (trySetVapid(subject, generated.publicKey, generated.privateKey)) {
    return markReady(generated.publicKey, "generated");
  }

  lastInitError = "Failed to generate valid VAPID keys";
  return false;
}

export async function initWebPush(): Promise<boolean> {
  if (initialized) return true;
  if (!initPromise) {
    const pending = resolveVapidKeys().catch((err) => {
      lastInitError = err instanceof Error ? err.message : String(err);
      logger.error("vapid_init_failed", { error: lastInitError });
      return false;
    });
    initPromise = pending;

    const ready = await pending;
    if (!ready && initPromise === pending) {
      // A transient database outage must not poison this process forever.
      // Keep successful initialization cached, but let the next request retry.
      initPromise = null;
    }
    return ready;
  }
  return initPromise;
}

export interface VapidDiagnostics {
  configured: boolean;
  hasPublicKey: boolean;
  hasPrivateKey: boolean;
  publicKeyLength: number;
  privateKeyLength: number;
  error: string | null;
  source: string | null;
  autoManaged: boolean;
}

export async function getVapidDiagnostics(): Promise<VapidDiagnostics> {
  await initWebPush();

  const envPublic = normalizeVapidKey(process.env.VAPID_PUBLIC_KEY);
  const envPrivate = normalizeVapidKey(process.env.VAPID_PRIVATE_KEY);
  const stored = await loadFromDatabase().catch(() => null);

  return {
    configured: initialized,
    hasPublicKey: !!(envPublic || stored?.publicKey || activePublicKey),
    hasPrivateKey: !!(envPrivate || stored?.privateKey),
    publicKeyLength: (activePublicKey || envPublic || stored?.publicKey || "").length,
    privateKeyLength: (envPrivate || stored?.privateKey || "").length,
    error: lastInitError,
    source: keySource,
    autoManaged: keySource === "database" || keySource === "generated",
  };
}

export function isVapidConfigured(): boolean {
  return initialized;
}

export async function getVapidPublicKey(): Promise<string | null> {
  if (!(await initWebPush())) return null;
  return activePublicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  rallyId: string;
  notificationType: string;
  assignmentId?: string;
  scheduledAt?: string;
  targetAt?: string;
  launchTime?: string;
  calibrationIndex?: number;
  calibrationTotal?: number;
  silent?: boolean;
  livePing?: boolean;
  dispatchId?: string;
  receiptToken?: string;
  subscriptionId?: string;
}

export interface PushSendResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  dispatchId?: string;
  providerMessageId?: string;
}

function responseHeader(
  headers: Record<string, string | string[] | undefined>,
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) return value[0];
    if (value) return value;
  }
  return undefined;
}

export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
  context?: PushDeliveryContext
): Promise<PushSendResult> {
  if (!(await initWebPush())) {
    return { success: false, error: lastInitError || "VAPID not configured" };
  }

  // Short TTL + Android Doze = messages expire before Chrome wakes.
  // Rally alerts need minutes of headroom; calibration probes can stay brief.
  const isEphemeral = !!payload.silent || !!payload.livePing || payload.notificationType === "CALIBRATION";
  const ttlSeconds = isEphemeral ? 90 : 900;
  // Don't let a hung FCM/web-push call block the scheduler tick forever.
  const SEND_TIMEOUT_MS = isEphemeral ? 5_000 : 8_000;

  let dispatchId: string | undefined;
  let receiptToken: string | undefined;
  if (context) {
    try {
      const attempt = await createPushDeliveryAttempt({
        context,
        payload,
        endpoint: subscription.endpoint,
        vapidPublicKey: activePublicKey,
      });
      dispatchId = attempt.dispatchId;
      receiptToken = attempt.receiptToken;
    } catch (err) {
      logger.warn("push_delivery_attempt_create_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const outboundPayload: PushPayload = {
    ...payload,
    ...(dispatchId ? { dispatchId } : {}),
    ...(receiptToken ? { receiptToken } : {}),
    ...(context?.subscriptionId ? { subscriptionId: context.subscriptionId } : {}),
  };
  const startedAt = Date.now();

  try {
    const response = await Promise.race([
      webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify(outboundPayload),
        {
          TTL: ttlSeconds,
          urgency: "high",
        }
      ),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("webpush_send_timeout")), SEND_TIMEOUT_MS);
      }),
    ]);
    const durationMs = Date.now() - startedAt;
    const providerMessageId = responseHeader(
      response.headers as Record<string, string | string[] | undefined>,
      "apns-id",
      "x-request-id",
      "location"
    );
    if (dispatchId) {
      await markPushProviderAccepted({
        dispatchId,
        statusCode: response.statusCode,
        messageId: providerMessageId,
        durationMs,
      }).catch(() => {});
    }
    return {
      success: true,
      statusCode: response.statusCode,
      dispatchId,
      providerMessageId,
    };
  } catch (err: unknown) {
    const error = err as { statusCode?: number; message?: string; body?: string };
    logger.error("push_send_failed", {
      statusCode: error.statusCode,
      error: error.message,
      body: error.body,
    });

    if (dispatchId) {
      await markPushProviderFailed({
        dispatchId,
        statusCode: error.statusCode,
        error: error.message || error.body || "Unknown push error",
        durationMs: Date.now() - startedAt,
      }).catch(() => {});
    }

    if (error.message === "webpush_send_timeout") {
      return { success: false, error: "push send timed out", dispatchId };
    }

    if (error.statusCode === 401) {
      return {
        success: false,
        statusCode: 401,
        dispatchId,
        error:
          "VAPID key mismatch — tap Disable then Enable notifications to re-register this device",
      };
    }

    return {
      success: false,
      statusCode: error.statusCode,
      error: error.message || "Unknown push error",
      dispatchId,
    };
  }
}

export function isExpiredSubscription(statusCode?: number): boolean {
  return statusCode === 404 || statusCode === 410;
}
