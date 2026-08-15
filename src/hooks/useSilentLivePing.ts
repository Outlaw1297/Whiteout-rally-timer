"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getOrCreateDeviceId } from "@/lib/client-device-id";
import { inspectServiceWorkerHealth } from "@/lib/service-worker-health";

const PRESENCE_INTERVAL_MS = 60_000;

async function getLocalPushState(): Promise<{
  state: "present" | "missing" | "unknown";
  endpoint?: string;
}> {
  try {
    if (!("serviceWorker" in navigator)) return { state: "unknown" };
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub
      ? { state: "present", endpoint: sub.endpoint }
      : { state: "missing" };
  } catch {
    return { state: "unknown" };
  }
}

/**
 * Lightweight HTTP presence heartbeat. Do not use Web Push for silent liveness
 * checks: Apple requires every push event to produce a visible notification.
 */
export function useSilentLivePing(enabled = true) {
  const { user } = useAuth();
  const presenceInFlightRef = useRef(false);
  const workerHealthReportedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !user) return;

    const sendPresence = async () => {
      if (presenceInFlightRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      presenceInFlightRef.current = true;
      try {
        const shouldReportWorkerHealth = !workerHealthReportedRef.current;
        const [localPush, workerHealth] = await Promise.all([
          getLocalPushState(),
          shouldReportWorkerHealth ? inspectServiceWorkerHealth() : Promise.resolve(null),
        ]);
        const response = await fetch("/api/push/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(localPush.endpoint ? { endpoint: localPush.endpoint } : {}),
            localSubscriptionState: localPush.state,
            deviceId: getOrCreateDeviceId(),
            ...(workerHealth
              ? { reportWorkerHealth: true, workerHealth }
              : {}),
          }),
          credentials: "include",
        });
        if (response.ok && shouldReportWorkerHealth) {
          workerHealthReportedRef.current = true;
        }
      } catch {
        /* next interval retries */
      } finally {
        presenceInFlightRef.current = false;
      }
    };

    const presenceInitial = window.setTimeout(sendPresence, 2_000);
    const presenceInterval = window.setInterval(sendPresence, PRESENCE_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        sendPresence();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(presenceInitial);
      window.clearInterval(presenceInterval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, user]);
}
