"use client";

import { useCallback, useEffect, useState } from "react";
import { assessPushEnvironment, detectPlatform } from "@/lib/push-support";

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

async function fetchPublicKey(): Promise<string | null> {
  const keyRes = await fetch("/api/push/subscribe");
  if (!keyRes.ok) return null;
  const data = await keyRes.json();
  return data.publicKey || null;
}

async function registerOnServer(subscription: PushSubscription) {
  const subJson = subscription.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: subJson.keys,
      userAgent: navigator.userAgent,
      platform: detectPlatform(),
    }),
  });
  return res.ok;
}

async function verifyEndpoint(endpoint: string) {
  const res = await fetch("/api/push/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) return { registered: false, active: false };
  return res.json() as Promise<{ registered: boolean; active: boolean }>;
}

export function usePushNotifications() {
  const [status, setStatus] = useState<NotificationStatus>("checking");
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [thisDeviceRegistered, setThisDeviceRegistered] = useState(false);

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

    let localSub = await registration.pushManager.getSubscription();

    // Permission granted but browser lost the subscription after SW/deploy — recreate it.
    if (!localSub && permission === "granted") {
      const publicKey = await fetchPublicKey();
      if (publicKey) {
        try {
          localSub = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        } catch (err) {
          console.warn("Auto re-subscribe failed:", err);
        }
      }
    }

    if (!localSub) {
      setThisDeviceRegistered(false);
      return permission === "granted" ? "granted" : "default";
    }

    const verified = await verifyEndpoint(localSub.endpoint);
    if (verified.registered && verified.active) {
      setThisDeviceRegistered(true);
      return "subscribed";
    }

    // Local sub exists but server lost it (redeploy / VAPID rotation) — re-register.
    const ok = await registerOnServer(localSub);
    if (ok) {
      setThisDeviceRegistered(true);
      return "subscribed";
    }

    // Keys may be mismatched — drop and recreate against current VAPID.
    try {
      await localSub.unsubscribe();
      const publicKey = await fetchPublicKey();
      if (!publicKey) {
        setThisDeviceRegistered(false);
        return "stale";
      }
      const fresh = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const registered = await registerOnServer(fresh);
      setThisDeviceRegistered(registered);
      return registered ? "subscribed" : "stale";
    } catch (err) {
      console.warn("Subscription repair failed:", err);
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

  const enableNotifications = async () => {
    setLoading(true);
    try {
      const environment = await assessPushEnvironment();
      if (environment !== "ready") {
        setStatus(environment);
        setThisDeviceRegistered(false);
        return false;
      }

      const registration = await registerServiceWorker();
      if (!registration) throw new Error("Service worker not supported");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        setThisDeviceRegistered(false);
        return false;
      }

      const publicKey = await fetchPublicKey();
      if (!publicKey) {
        throw new Error("VAPID public key not available");
      }

      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        }).catch(() => {});
        await existing.unsubscribe();
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const ok = await registerOnServer(subscription);
      if (!ok) throw new Error("Failed to subscribe");

      setThisDeviceRegistered(true);
      setStatus("subscribed");
      return true;
    } catch (err) {
      console.error("Push subscription failed:", err);
      setThisDeviceRegistered(false);
      setStatus("stale");
      return false;
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
    isEnabled: status === "subscribed",
    isSubscribed: status === "subscribed",
  };
}
