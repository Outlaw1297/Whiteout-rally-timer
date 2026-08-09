import webpush from "web-push";
import { logger } from "./logger";

let initialized = false;
let lastInitError: string | null = null;

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

export interface VapidDiagnostics {
  configured: boolean;
  hasPublicKey: boolean;
  hasPrivateKey: boolean;
  publicKeyLength: number;
  privateKeyLength: number;
  error: string | null;
}

export function getVapidDiagnostics(): VapidDiagnostics {
  const publicKey = normalizeVapidKey(process.env.VAPID_PUBLIC_KEY);
  const privateKey = normalizeVapidKey(process.env.VAPID_PRIVATE_KEY);

  return {
    configured: initialized,
    hasPublicKey: !!publicKey,
    hasPrivateKey: !!privateKey,
    publicKeyLength: publicKey?.length ?? 0,
    privateKeyLength: privateKey?.length ?? 0,
    error: lastInitError,
  };
}

export function isVapidConfigured(): boolean {
  return initialized;
}

export function initWebPush(): boolean {
  if (initialized) return true;

  const publicKey = normalizeVapidKey(process.env.VAPID_PUBLIC_KEY);
  const privateKey = normalizeVapidKey(process.env.VAPID_PRIVATE_KEY);
  const subject = (process.env.VAPID_SUBJECT || "mailto:admin@example.com").trim();

  if (!publicKey || !privateKey) {
    lastInitError = !publicKey && !privateKey
      ? "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not set"
      : !publicKey
        ? "VAPID_PUBLIC_KEY is missing or empty"
        : "VAPID_PRIVATE_KEY is missing or empty";
    console.warn(JSON.stringify({ event: "vapid_not_configured", error: lastInitError }));
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    initialized = true;
    lastInitError = null;
    console.log(JSON.stringify({ event: "vapid_initialized" }));
    return true;
  } catch (err) {
    lastInitError = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        event: "vapid_init_failed",
        error: lastInitError,
        publicKeyLength: publicKey.length,
        privateKeyLength: privateKey.length,
        hint: "Generate a fresh pair with: npm run generate:vapid",
      })
    );
    return false;
  }
}

export function getVapidPublicKey(): string | null {
  if (!initWebPush()) return null;
  return normalizeVapidKey(process.env.VAPID_PUBLIC_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  rallyId: string;
  notificationType: string;
  assignmentId?: string;
}

export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  if (!initWebPush()) {
    return { success: false, error: lastInitError || "VAPID not configured" };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload),
      { TTL: 60, urgency: "high" }
    );
    return { success: true };
  } catch (err: unknown) {
    const error = err as { statusCode?: number; message?: string };
    logger.error("push_send_failed", {
      statusCode: error.statusCode,
      error: error.message,
    });
    return {
      success: false,
      statusCode: error.statusCode,
      error: error.message || "Unknown push error",
    };
  }
}

export function isExpiredSubscription(statusCode?: number): boolean {
  return statusCode === 404 || statusCode === 410;
}
