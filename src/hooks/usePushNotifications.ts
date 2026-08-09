"use client";

import { useCallback, useEffect, useState } from "react";

const USER_ID_KEY = "rally_user_id";

export function getUserId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export type NotificationStatus = "unsupported" | "default" | "granted" | "denied" | "subscribed";

export function usePushNotifications(rallyId?: string) {
  const [status, setStatus] = useState<NotificationStatus>("default");
  const [loading, setLoading] = useState(false);
  const [subscriptionEndpoint, setSubscriptionEndpoint] = useState<string | null>(null);

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
        setSubscriptionEndpoint(sub.endpoint);
        if (rallyId) {
          const res = await fetch(
            `/api/rallies/${rallyId}/subscription?endpoint=${encodeURIComponent(sub.endpoint)}`
          );
          const data = await res.json();
          setStatus(data.subscribed && data.active ? "subscribed" : "granted");
        } else {
          setStatus("granted");
        }
      } else {
        setStatus(permission === "granted" ? "granted" : "default");
      }
    } catch {
      setStatus("default");
    }
  }, [rallyId]);

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
      const { publicKey } = await keyRes.json();
      if (!publicKey) throw new Error("VAPID public key not available");

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const subJson = subscription.toJSON();
      const userId = getUserId();

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          endpoint: subscription.endpoint,
          keys: subJson.keys,
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          rallyId,
        }),
      });

      if (!res.ok) throw new Error("Failed to subscribe");

      setSubscriptionEndpoint(subscription.endpoint);
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
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            rallyId,
          }),
        });
        if (!rallyId) {
          await subscription.unsubscribe();
        }
      }
      setStatus("default");
      setSubscriptionEndpoint(null);
    } finally {
      setLoading(false);
    }
  };

  return {
    status,
    loading,
    subscriptionEndpoint,
    enableNotifications,
    disableNotifications,
    checkStatus,
    isEnabled: status === "subscribed" || status === "granted",
    isSubscribed: status === "subscribed",
  };
}
