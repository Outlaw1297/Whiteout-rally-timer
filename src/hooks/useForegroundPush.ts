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

function tryPageNotification(message: ForegroundPushMessage) {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  try {
    const textTitle = String(message.title || "Whiteout Rally").trim() || "Whiteout Rally";
    const textBody =
      String(message.body || "Rally notification")
        .replace(/\n+/g, " · ")
        .replace(/\s+/g, " ")
        .trim() || "Rally notification";
    const notification = new Notification(textTitle, {
      body: textBody,
      icon: "/icons/icon-192.png",
      tag: `rally-fg-${message.rallyId}-${message.notificationType}-${message.assignmentId}-${message.scheduledAt}`,
    });
    notification.onclick = () => {
      window.focus();
      if (message.url) window.location.href = message.url;
      notification.close();
    };
  } catch {
    // iOS standalone may not allow page-level Notification — in-app banner covers this.
  }
}

function tryVibrate(notificationType: string) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  navigator.vibrate(
    notificationType === "LAUNCH" ? [300, 100, 300, 100, 300] : [200, 100, 200]
  );
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

    setMessages((prev) => [...prev.slice(-2), message]);
    tryPageNotification(message);
    tryVibrate(notificationType);

    if (targetAt) {
      reportDeliveryFeedback({
        targetAt,
        receivedAtMs: now,
        assignmentId,
        notificationType,
        rallyId,
      });
    }

    if (notificationType !== "LAUNCH") {
      window.setTimeout(() => dismiss(message.id), 5000);
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
