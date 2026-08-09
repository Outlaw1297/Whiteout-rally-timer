import webpush from "web-push";
import { logger } from "./logger";

let initialized = false;

export function initWebPush() {
  if (initialized) return;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

  if (!publicKey || !privateKey) {
    console.warn("VAPID keys not configured. Push notifications will not work.");
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialized = true;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export interface PushPayload {
  title: string;
  body: string;
  rallyId: string;
  notificationType: string;
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
