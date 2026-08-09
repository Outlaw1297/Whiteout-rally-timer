"use client";

import Link from "next/link";
import { useForegroundPush } from "@/hooks/useForegroundPush";

export function ForegroundNotificationListener() {
  const { messages, dismiss } = useForegroundPush();

  if (messages.length === 0) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] flex flex-col gap-2 p-3 pointer-events-none">
      {messages.map((message) => {
        const isLaunch = message.notificationType === "LAUNCH";
        return (
          <div
            key={message.id}
            className={`pointer-events-auto rounded-lg border shadow-lg px-4 py-3 ${
              isLaunch
                ? "bg-rally-danger/95 border-rally-danger text-white"
                : "bg-rally-surface/95 border-rally-warning text-rally-text"
            }`}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-sm">{message.title}</p>
                <p className={`text-sm mt-0.5 whitespace-pre-line ${isLaunch ? "text-white/90" : "text-rally-muted"}`}>
                  {message.body}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(message.id)}
                className={`shrink-0 text-xs font-bold px-2 py-1 rounded ${
                  isLaunch ? "bg-white/20 hover:bg-white/30" : "bg-rally-border hover:bg-rally-muted/30"
                }`}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
            {message.url && (
              <Link
                href={message.url}
                onClick={() => dismiss(message.id)}
                className={`inline-block mt-2 text-xs font-bold underline ${
                  isLaunch ? "text-white" : "text-rally-accent"
                }`}
              >
                Open rally
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
