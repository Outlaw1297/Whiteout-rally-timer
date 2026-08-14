"use client";

import { useCallback, useEffect, useState } from "react";
import {
  assessPushEnvironment,
  detectPlatform,
  isDesktopEdge,
  pushEnableHint,
} from "@/lib/push-support";
import { getOrCreateDeviceId } from "@/lib/client-device-id";

export type NotificationStatus =
  | "checking"
  | "unsupported"
  | "ios-use-safari"
  | "ios-install"
  | "default"
  | "granted"
  | "denied"
  | "subscribed"
  | "stale"
  | "device-in-use";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return "Unknown push error";
}

async function fetchPublicKey(): Promise<string> {
  const keyRes = await fetch("/api/push/subscribe");
  if (!keyRes.ok) {
    const data = await keyRes.json().catch(() => ({}));
    throw new Error(data.error || `Could not load push keys (HTTP ${keyRes.status})`);
  }
  const data = await keyRes.json();
  if (!data.publicKey) throw new Error("VAPID public key not available");
  return data.publicKey as string;
}

async function registerOnServer(subscription: PushSubscription): Promise<void> {
  const subJson = subscription.toJSON();
  if (!subJson.keys?.p256dh || !subJson.keys?.auth) {
    throw new Error("Browser subscription is missing encryption keys");
  }

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: subJson.keys,
      userAgent: navigator.userAgent,
      platform: detectPlatform(),
      deviceId: getOrCreateDeviceId(),
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error("Session expired — log in again, then enable notifications");
    }
    throw new Error(data.error || `Server rejected subscription (HTTP ${res.status})`);
  }
}

type VerifyResult = { registered: boolean; active: boolean; reason?: string };

async function verifyEndpoint(endpoint: string): Promise<VerifyResult> {
  const res = await fetch("/api/push/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) return { registered: false, active: false };
  return res.json() as Promise<VerifyResult>;
}

/**
 * A browser has exactly one live push subscription per service worker.
 * When a second account logs in on the same device, that subscription
 * still belongs to whoever registered it last — resubscribing here mints
 * a fresh endpoint for the current account instead of stealing the old one.
 */
async function replaceWithFreshSubscription(
  registration: ServiceWorkerRegistration,
  existing: PushSubscription,
  publicKey: string
): Promise<PushSubscription> {
  await existing.unsubscribe().catch(() => {});
  await sleep(250);
  return subscribeWithKey(registration, publicKey);
}

async function subscribeWithKey(
  registration: ServiceWorkerRegistration,
  publicKey: string
): Promise<PushSubscription> {
  try {
    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  } catch (err) {
    const message = errorMessage(err);
    // Edge/Chromium often throw AbortError when an old subscription is stuck.
    if (/abort|invalidstate|push service|registration failed/i.test(message)) {
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe().catch(() => {});
        await sleep(250);
      }
      return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    throw err;
  }
}

export function usePushNotifications() {
  const [status, setStatus] = useState<NotificationStatus>("checking");
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [thisDeviceRegistered, setThisDeviceRegistered] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const registerServiceWorker = async () => {
    if (!("serviceWorker" in navigator)) return null;
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return registration;
  };

  const syncLocalSubscription = useCallback(async (): Promise<NotificationStatus> => {
    const environment = await assessPushEnvironment();
    if (environment !== "ready") {
      setThisDeviceRegistered(false);
      return environment;
    }

    const permission = Notification.permission;
    if (permission === "denied") {
      setThisDeviceRegistered(false);
      return "denied";
    }

    const registration = await registerServiceWorker();
    if (!registration) {
      setThisDeviceRegistered(false);
      return "unsupported";
    }

    const localSub = await registration.pushManager.getSubscription();
    if (!localSub) {
      setThisDeviceRegistered(false);
      return permission === "granted" ? "granted" : "default";
    }

    try {
      const verified = await verifyEndpoint(localSub.endpoint);
      if (verified.registered && verified.active) {
        setThisDeviceRegistered(true);
        return "subscribed";
      }

      if (verified.reason === "owned_by_other") {
        // Another account currently owns this device's one push channel.
        // Don't silently re-register — that would steal it back on every
        // page load and leave the other account's alerts dead with no signal.
        setThisDeviceRegistered(false);
        return "device-in-use";
      }

      // Local sub exists but server lost it — re-register without forcing a new browser sub.
      await registerOnServer(localSub);
      setThisDeviceRegistered(true);
      setLastError(null);
      return "subscribed";
    } catch {
      // Don't auto-unsubscribe during status checks — leave that to explicit Enable.
      setThisDeviceRegistered(false);
      return "stale";
    }
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const next = await syncLocalSubscription();
      setStatus(next);
    } catch {
      setThisDeviceRegistered(false);
      setStatus("default");
    }
  }, [syncLocalSubscription]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const enableNotifications = async (): Promise<{ ok: boolean; error?: string }> => {
    setLoading(true);
    setLastError(null);
    try {
      const environment = await assessPushEnvironment();
      if (environment !== "ready") {
        setStatus(environment);
        setThisDeviceRegistered(false);
        const msg =
          environment === "unsupported"
            ? "Push notifications are not supported in this browser"
            : "Complete the browser setup steps shown above";
        setLastError(msg);
        return { ok: false, error: msg };
      }

      const registration = await registerServiceWorker();
      if (!registration) {
        const msg = "Service worker not supported in this browser";
        setStatus("unsupported");
        setLastError(msg);
        return { ok: false, error: msg };
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        setThisDeviceRegistered(false);
        const msg = isDesktopEdge()
          ? "Edge blocked notifications. Click the lock icon → Notifications → Allow, and enable Windows notifications for Edge."
          : "Notification permission was blocked. Allow notifications for this site in browser settings.";
        setLastError(msg);
        return { ok: false, error: msg };
      }

      const publicKey = await fetchPublicKey();

      let existing = await registration.pushManager.getSubscription();
      if (existing) {
        // A verify failure here (e.g. flaky connection) shouldn't block Enable —
        // fall through to the normal reuse attempt, which the server will still
        // accept even for a genuine cross-account handoff.
        const verified = await verifyEndpoint(existing.endpoint).catch(
          () => ({ registered: false, active: false }) as VerifyResult
        );
        if (verified.reason === "owned_by_other") {
          // Someone else is currently registered on this device — the user
          // explicitly tapped Enable, so this is a deliberate handoff. Mint
          // a fresh endpoint for this account rather than reassigning theirs.
          existing = await replaceWithFreshSubscription(registration, existing, publicKey);
        } else {
          // Prefer reusing the existing subscription if the server will accept it.
          try {
            await registerOnServer(existing);
            setThisDeviceRegistered(true);
            setStatus("subscribed");
            return { ok: true };
          } catch {
            await existing.unsubscribe().catch(() => {});
            await sleep(300);
            existing = null;
          }
        }
      }

      const subscription = existing || (await subscribeWithKey(registration, publicKey));
      await registerOnServer(subscription);

      setThisDeviceRegistered(true);
      setStatus("subscribed");
      return { ok: true };
    } catch (err) {
      console.error("Push subscription failed:", err);
      const raw = errorMessage(err);
      const msg = pushEnableHint(raw);
      setThisDeviceRegistered(false);
      setStatus("stale");
      setLastError(msg);
      return { ok: false, error: msg };
    } finally {
      setLoading(false);
    }
  };

  const disableNotifications = async () => {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setThisDeviceRegistered(false);
      setStatus("default");
      setLastError(null);
    } finally {
      setLoading(false);
    }
  };

  const sendTestNotification = async () => {
    setTestLoading(true);
    try {
      return await fetch("/api/push/test", { method: "POST" });
    } finally {
      setTestLoading(false);
    }
  };

  return {
    status,
    loading,
    testLoading,
    enableNotifications,
    disableNotifications,
    sendTestNotification,
    checkStatus,
    thisDeviceRegistered,
    lastError,
    isEnabled: status === "subscribed",
    isSubscribed: status === "subscribed",
  };
}
