"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ForegroundPushMessage {
  id: string;
  title: string;
  body: string;
  rallyId: string;
  notificationType: string;
  assignmentId: string;
  url: string;
  receivedAt: number;
}

function tryPageNotification(message: ForegroundPushMessage) {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  try {
    const notification = new Notification(message.title, {
      body: message.body,
      icon: "/icons/icon-192.png",
      tag: `rally-fg-${message.rallyId}-${message.notificationType}-${message.assignmentId}`,
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
  const seenRef = useRef(new Set<string>());

  const dismiss = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handlePush = useCallback((data: Record<string, unknown>) => {
    if (data.type !== "rally-push") return;

    const notificationType = String(data.notificationType || "");
    const rallyId = String(data.rallyId || "");
    const assignmentId = String(data.assignmentId || "");
    const dedupeKey = `${rallyId}:${notificationType}:${assignmentId}:${String(data.title || "")}`;

    if (seenRef.current.has(dedupeKey)) return;
    seenRef.current.add(dedupeKey);

    const message: ForegroundPushMessage = {
      id: `${Date.now()}-${dedupeKey}`,
      title: String(data.title || "Whiteout Rally"),
      body: String(data.body || "Rally notification"),
      rallyId,
      notificationType,
      assignmentId,
      url: String(data.url || "/caller"),
      receivedAt: Date.now(),
    };

    setMessages((prev) => [...prev.slice(-2), message]);
    tryPageNotification(message);
    tryVibrate(notificationType);

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
