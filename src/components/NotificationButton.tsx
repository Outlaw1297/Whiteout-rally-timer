"use client";

import { useState } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface NotificationButtonProps {
  rallyId?: string;
}

export function NotificationButton({ rallyId }: NotificationButtonProps) {
  const { status, loading, enableNotifications, disableNotifications, isSubscribed } =
    usePushNotifications(rallyId);

  if (status === "unsupported") {
    return (
      <div className="text-rally-muted text-sm text-center">
        Push notifications not supported in this browser
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="text-rally-danger text-sm text-center">
        Notifications blocked. Enable in Safari Settings → Notifications.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-rally-muted">NOTIFICATIONS</span>
        {isSubscribed ? (
          <span className="text-rally-success font-bold">✓ ENABLED</span>
        ) : (
          <span className="text-rally-muted font-bold">○ DISABLED</span>
        )}
      </div>

      {!isSubscribed ? (
        <>
          <button
            onClick={enableNotifications}
            disabled={loading}
            className="w-full py-4 px-6 bg-rally-accent hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-lg rounded-lg transition-colors"
          >
            {loading ? "ENABLING..." : "ENABLE RALLY ALERTS"}
          </button>
          <p className="text-rally-muted text-xs text-center px-2">
            Enable notifications to receive rally alerts while Whiteout Survival is
            open or your phone is locked.
          </p>
        </>
      ) : (
        <>
          <p className="text-rally-success text-sm font-bold">
            ✓ Rally notifications enabled
          </p>
          <button
            onClick={disableNotifications}
            disabled={loading}
            className="w-full py-3 px-6 bg-rally-surface border border-rally-border hover:border-rally-danger text-rally-muted hover:text-rally-danger font-medium text-sm rounded-lg transition-colors"
          >
            {loading ? "DISABLING..." : "DISABLE ALERTS"}
          </button>
        </>
      )}
    </div>
  );
}

export function CopyRallyLink({ rallyId }: { rallyId: string }) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const url = `${window.location.origin}/rally/${rallyId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copyLink}
      className="w-full py-3 px-6 bg-rally-surface border border-rally-border hover:border-rally-accent text-rally-text font-bold text-sm rounded-lg transition-colors"
    >
      {copied ? "✓ LINK COPIED" : "COPY RALLY LINK"}
    </button>
  );
}
