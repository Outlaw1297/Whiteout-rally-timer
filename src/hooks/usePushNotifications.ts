"use client";

import { useCallback, useEffect, useState } from "react";
import {
  assessPushEnvironment,
  detectPlatform,
  isDesktopEdge,
  pushEnableHint,
} from "@/lib/push-support";
import { getOrCreateDeviceId } from "@/lib/client-device-id";

const PUSH_DISABLED_STORAGE_KEY = "rally-push-disabled";

export type NotificationStatus =
  | "checking"
  | "unsupported"
  | "ios-use-safari"
  | "ios-install"
  | "default"
  | "granted"
  | "denied"
  | "subscribed"
  | "stale";

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

async function registerOnServer(
  subscription: PushSubscription,
  repairReason?: string
): Promise<void> {
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
      ...(repairReason ? { repairReason } : {}),
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

async function backendExpectsThisDevice(): Promise<boolean> {
  const params = new URLSearchParams({ deviceId: getOrCreateDeviceId() });
  const res = await fetch(`/api/push/status?${params}`, { cache: "no-store" });
  if (!res.ok) return false;
  const data = await res.json();
  return data.thisDeviceExpected === true;
}

async function verifySubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const res = await fetch("/api/push/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: json.keys,
      deviceId: getOrCreateDeviceId(),
    }),
  });
  if (!res.ok) return { registered: false, active: false, matches: false };
  return res.json() as Promise<{
    registered: boolean;
    active: boolean;
    matches: boolean;
    reason?: string;
  }>;
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
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
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
      const intentionallyDisabled = localStorage.getItem(PUSH_DISABLED_STORAGE_KEY) === "true";
      if (permission === "granted" && !intentionallyDisabled) {
        try {
          // Only self-heal if the backend still expected a subscription for this
          // install. This avoids undoing an intentional Disable from older builds.
          if (await backendExpectsThisDevice()) {
            const publicKey = await fetchPublicKey();
            const repaired = await subscribeWithKey(registration, publicKey);
            await registerOnServer(repaired, "local_subscription_missing");
            setThisDeviceRegistered(true);
            setLastError(null);
            return "subscribed";
          }
        } catch {
          return "stale";
        }
      }
      return permission === "granted" ? "granted" : "default";
    }

    try {
      const verified = await verifySubscription(localSub);
      if (verified.registered && verified.active && verified.matches) {
        setThisDeviceRegistered(true);
        return "subscribed";
      }

      // Local subscription exists but the server row or encryption keys drifted.
      // Re-register the complete browser subscription without minting a new one.
      await registerOnServer(localSub, verified.reason || "server_subscription_mismatch");
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

      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        // Prefer reusing the existing subscription if the server will accept it.
        try {
          await registerOnServer(existing);
          localStorage.removeItem(PUSH_DISABLED_STORAGE_KEY);
          setThisDeviceRegistered(true);
          setStatus("subscribed");
          return { ok: true };
        } catch {
          await existing.unsubscribe().catch(() => {});
          await sleep(300);
        }
      }

      const subscription = await subscribeWithKey(registration, publicKey);
      await registerOnServer(subscription);

      localStorage.removeItem(PUSH_DISABLED_STORAGE_KEY);
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
    localStorage.setItem(PUSH_DISABLED_STORAGE_KEY, "true");
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
