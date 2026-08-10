"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const LIVE_PING_INTERVAL_MS = 5 * 60_000;
const LIVE_PING_STORAGE_KEY = "rally-live-ping-at";

/**
 * Quiet delivery-timing pings while the app is open and no rally timers are running.
 * Skips when a rally is ACTIVE so real alerts are not competing with calibration traffic.
 */
export function useSilentLivePing(enabled = true) {
  const { user } = useAuth();
  const { isSubscribed } = usePushNotifications();
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !user || !isSubscribed) return;

    const run = async () => {
      if (inFlightRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

      const last = Number(localStorage.getItem(LIVE_PING_STORAGE_KEY) || 0);
      if (Date.now() - last < LIVE_PING_INTERVAL_MS - 5_000) return;

      inFlightRef.current = true;
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
        inFlightRef.current = false;
      }
    };

    const initial = window.setTimeout(run, 8_000);
    const interval = window.setInterval(run, LIVE_PING_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, user, isSubscribed]);
}
