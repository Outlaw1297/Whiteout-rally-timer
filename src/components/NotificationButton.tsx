"use client";

import { useState } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export function NotificationButton({ onStatusChange }: { onStatusChange?: () => void }) {
  const {
    status,
    loading,
    testLoading,
    enableNotifications,
    disableNotifications,
    sendTestNotification,
    isSubscribed,
  } = usePushNotifications();

  const [error, setError] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);

  const handleEnable = async () => {
    setError(null);
    const ok = await enableNotifications();
    if (!ok) {
      setError("Could not enable notifications. Check browser permission and server VAPID keys.");
    } else {
      onStatusChange?.();
    }
  };

  const handleDisable = async () => {
    setError(null);
    await disableNotifications();
    onStatusChange?.();
  };

  const handleTest = async () => {
    setError(null);
    const res = await sendTestNotification();
    if (res.ok) {
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    } else {
      const data = await res.json().catch(() => ({}));
      const msg = data.error || "Test notification failed.";
      setError(
        msg.includes("VAPID") || msg.includes("vapid")
          ? `${msg} Try Disable then Enable notifications to re-register this device.`
          : msg
      );
    }
  };

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
        Notifications blocked. Enable in device Settings → Notifications.
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
            onClick={handleEnable}
            disabled={loading}
            className="w-full py-4 px-6 bg-rally-accent hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-lg rounded-lg transition-colors"
          >
            {loading ? "ENABLING..." : "ENABLE RALLY NOTIFICATIONS"}
          </button>
          <p className="text-rally-muted text-xs text-center px-2">
            Required after installing the app. Allows rally alerts even when the app is in the
            background.
          </p>
        </>
      ) : (
        <>
          <p className="text-rally-success text-sm font-bold">✓ NOTIFICATIONS ENABLED</p>
          <button
            onClick={handleTest}
            disabled={testLoading}
            className="w-full py-3 px-6 bg-rally-surface border border-rally-border hover:border-rally-accent text-rally-text font-bold text-sm rounded-lg transition-colors"
          >
            {testLoading ? "SENDING..." : testSent ? "✓ TEST SENT" : "SEND TEST NOTIFICATION"}
          </button>
          <button
            onClick={handleDisable}
            disabled={loading}
            className="w-full py-2 px-6 text-rally-muted hover:text-rally-danger text-xs transition-colors"
          >
            {loading ? "DISABLING..." : "Disable notifications"}
          </button>
        </>
      )}

      {error && <p className="text-rally-danger text-xs text-center">{error}</p>}
    </div>
  );
}
