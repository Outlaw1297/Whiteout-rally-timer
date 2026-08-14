"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clockSync } from "@/lib/clock-sync";
import { reportDeliveryFeedback } from "@/lib/report-delivery-feedback";

export interface ForegroundPushMessage {
  id: string;
  title: string;
  body: string;
  rallyId: string;
  notificationType: string;
  assignmentId: string;
  scheduledAt: string;
  targetAt: string;
  url: string;
  receivedAt: number;
}

export function useForegroundPush() {
  const [messages, setMessages] = useState<ForegroundPushMessage[]>([]);
  const recentRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handlePush = useCallback((data: Record<string, unknown>) => {
    if (data.type !== "rally-push") return;

    const notificationType = String(data.notificationType || "");

    if (notificationType === "CALIBRATION") {
      const index = Number(data.calibrationIndex || 0);
      const total = Number(data.calibrationTotal || 0);
      if (index > 0 && total > 0) {
        window.dispatchEvent(
          new CustomEvent("push-calibration-progress", {
            detail: { index, total },
          })
        );
      }
      const targetAt = String(data.targetAt || "");
      if (targetAt) {
        reportDeliveryFeedback({
          targetAt,
          receivedAtMs: clockSync.correctedNow(),
          notificationType,
          rallyId: String(data.rallyId || "calibration"),
        });
      }
      return;
    }

    const rallyId = String(data.rallyId || "");
    const assignmentId = String(data.assignmentId || "");
    const scheduledAt = String(data.scheduledAt || "");
    const targetAt = String(data.targetAt || "");
    const dedupeKey = `${rallyId}:${notificationType}:${assignmentId}:${scheduledAt}`;
    const now = clockSync.correctedNow();
    const lastSeen = recentRef.current.get(dedupeKey);
    if (lastSeen && now - lastSeen < 3000) return;
    recentRef.current.set(dedupeKey, now);

    const message: ForegroundPushMessage = {
      id: `${now}-${dedupeKey}`,
      title: String(data.title || "Whiteout Rally"),
      body: String(data.body || "Rally notification"),
      rallyId,
      notificationType,
      assignmentId,
      scheduledAt,
      targetAt,
      url: String(data.url || "/caller"),
      receivedAt: now,
    };

    // SW already showed the OS heads-up + vibrate. Do not create a second
    // Notification() here — that blocks the main thread and makes the
    // on-screen countdown hitch at throw time.
    const showBanner = () => {
      setMessages((prev) => [...prev.slice(-2), message]);
      // Auto-dismiss after insert: background tabs pause rAF while
      // setTimeout still runs, so a timer started before showBanner can
      // fire against an empty list and leave the banner stuck.
      if (notificationType !== "LAUNCH") {
        window.setTimeout(() => dismiss(message.id), 5000);
      }
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(showBanner));
    } else {
      window.setTimeout(showBanner, 0);
    }

    if (targetAt) {
      reportDeliveryFeedback({
        targetAt,
        receivedAtMs: now,
        assignmentId,
        notificationType,
        rallyId,
      });
    }
  }, [dismiss]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;
      handlePush(event.data as Record<string, unknown>);
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [handlePush]);

  return { messages, dismiss };
}
