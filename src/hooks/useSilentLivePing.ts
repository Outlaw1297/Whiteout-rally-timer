"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const LIVE_PING_INTERVAL_MS = 2 * 60_000;
const PRESENCE_INTERVAL_MS = 60_000;
const LIVE_PING_STORAGE_KEY = "rally-live-ping-at";

async function getPushEndpoint(): Promise<string | undefined> {
  try {
    if (!("serviceWorker" in navigator)) return undefined;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub?.endpoint;
  } catch {
    return undefined;
  }
}

/**
 * Quiet delivery-timing pings while the app is open and no rally timers are running.
 * Also sends a lightweight presence heartbeat so admins can see online/offline status.
 */
export function useSilentLivePing(enabled = true) {
  const { user } = useAuth();
  const { isSubscribed } = usePushNotifications();
  const pingInFlightRef = useRef(false);
  const presenceInFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !user) return;

    const sendPresence = async () => {
      if (presenceInFlightRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      presenceInFlightRef.current = true;
      try {
        const endpoint = isSubscribed ? await getPushEndpoint() : undefined;
        await fetch("/api/push/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(endpoint ? { endpoint } : {}),
          credentials: "include",
        });
      } catch {
        /* next interval retries */
      } finally {
        presenceInFlightRef.current = false;
      }
    };

    const runLivePing = async () => {
      if (!isSubscribed) return;
      if (pingInFlightRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

      const last = Number(localStorage.getItem(LIVE_PING_STORAGE_KEY) || 0);
      if (Date.now() - last < LIVE_PING_INTERVAL_MS - 5_000) return;

      pingInFlightRef.current = true;
      try {
        const res = await fetch("/api/push/calibrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "live", silent: true }),
        });
        if (res.ok || res.status === 409) {
          localStorage.setItem(LIVE_PING_STORAGE_KEY, String(Date.now()));
        }
      } catch {
        // ignore network errors — next interval retries
      } finally {
        pingInFlightRef.current = false;
      }
    };

    const presenceInitial = window.setTimeout(sendPresence, 2_000);
    const presenceInterval = window.setInterval(sendPresence, PRESENCE_INTERVAL_MS);
    const pingInitial = window.setTimeout(runLivePing, 8_000);
    const pingInterval = window.setInterval(runLivePing, LIVE_PING_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        sendPresence();
        runLivePing();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(presenceInitial);
      window.clearInterval(presenceInterval);
      window.clearTimeout(pingInitial);
      window.clearInterval(pingInterval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, user, isSubscribed]);
}
