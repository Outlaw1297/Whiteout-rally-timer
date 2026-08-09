"use client";

import { useCallback, useEffect, useState } from "react";

export type NotificationStatus = "unsupported" | "default" | "granted" | "denied" | "subscribed";

function detectPlatform(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  return "Desktop";
}

export function usePushNotifications() {
  const [status, setStatus] = useState<NotificationStatus>("default");
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }

    const permission = Notification.permission;
    if (permission === "denied") {
      setStatus("denied");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        setStatus("subscribed");
      } else {
        setStatus(permission === "granted" ? "granted" : "default");
      }
    } catch {
      setStatus("default");
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const registerServiceWorker = async () => {
    if (!("serviceWorker" in navigator)) return null;
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return registration;
  };

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const enableNotifications = async () => {
    setLoading(true);
    try {
      const registration = await registerServiceWorker();
      if (!registration) throw new Error("Service worker not supported");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return false;
      }

      const keyRes = await fetch("/api/push/subscribe");
      if (!keyRes.ok) {
        throw new Error(
          keyRes.status === 503
            ? "Push not configured on server (VAPID keys missing)"
            : "Could not fetch push configuration"
        );
      }
      const { publicKey } = await keyRes.json();
      if (!publicKey) throw new Error("VAPID public key not available");

      // Always re-subscribe so device keys match the server's current VAPID pair.
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

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

      if (!res.ok) throw new Error("Failed to subscribe");

      setStatus("subscribed");
      return true;
    } catch (err) {
      console.error("Push subscription failed:", err);
      setStatus("denied");
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
    isEnabled: status === "subscribed",
    isSubscribed: status === "subscribed",
  };
}
