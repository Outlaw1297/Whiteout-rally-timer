import webpush from "web-push";
import { logger } from "./logger";

let initialized = false;

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
  // Remove line breaks/spaces from copy-paste (keys must be one continuous string)
  normalized = normalized.replace(/\s+/g, "");
  // web-push requires URL-safe base64 without padding
  normalized = normalized.replace(/=+$/, "");

  return normalized || null;
}

export function isVapidConfigured(): boolean {
  return initialized;
}

export function initWebPush() {
  if (initialized) return;

  const publicKey = normalizeVapidKey(process.env.VAPID_PUBLIC_KEY);
  const privateKey = normalizeVapidKey(process.env.VAPID_PRIVATE_KEY);
  const subject = (process.env.VAPID_SUBJECT || "mailto:admin@example.com").trim();

  if (!publicKey || !privateKey) {
    console.warn(
      JSON.stringify({
        event: "vapid_not_configured",
        message: "Push notifications disabled — set valid VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY",
      })
    );
    return;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    initialized = true;
    console.log(JSON.stringify({ event: "vapid_initialized" }));
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "vapid_init_failed",
        error: String(err),
        hint: "Run npm run generate:vapid and paste keys into Render without quotes or padding",
      })
    );
  }
}

export function getVapidPublicKey(): string | null {
  if (!initialized) {
    const publicKey = normalizeVapidKey(process.env.VAPID_PUBLIC_KEY);
    const privateKey = normalizeVapidKey(process.env.VAPID_PRIVATE_KEY);
    if (!publicKey || !privateKey) return null;
    return publicKey;
  }
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
  initWebPush();

  if (!initialized) {
    return { success: false, error: "VAPID not configured" };
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
