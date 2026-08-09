"use client";

import { useState } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export function NotificationButton() {
  const {
    status,
    loading,
    testLoading,
    enableNotifications,
    disableNotifications,
    sendTestNotification,
    isSubscribed,
  } = usePushNotifications();

  const [testSent, setTestSent] = useState(false);

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
            onClick={enableNotifications}
            disabled={loading}
            className="w-full py-4 px-6 bg-rally-accent hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-lg rounded-lg transition-colors"
          >
            {loading ? "ENABLING..." : "ENABLE RALLY NOTIFICATIONS"}
          </button>
          <p className="text-rally-muted text-xs text-center px-2">
            Enable notifications so you can be alerted when it is time to throw your
            rally, even when Whiteout Survival is open.
          </p>
        </>
      ) : (
        <>
          <p className="text-rally-success text-sm font-bold">✓ NOTIFICATIONS ENABLED</p>
          <button
            onClick={async () => {
              const ok = await sendTestNotification();
              if (ok) {
                setTestSent(true);
                setTimeout(() => setTestSent(false), 3000);
              }
            }}
            disabled={testLoading}
            className="w-full py-3 px-6 bg-rally-surface border border-rally-border hover:border-rally-accent text-rally-text font-bold text-sm rounded-lg transition-colors"
          >
            {testLoading ? "SENDING..." : testSent ? "✓ TEST SENT" : "SEND TEST NOTIFICATION"}
          </button>
          <button
            onClick={disableNotifications}
            disabled={loading}
            className="w-full py-2 px-6 text-rally-muted hover:text-rally-danger text-xs transition-colors"
          >
            {loading ? "DISABLING..." : "Disable notifications"}
          </button>
        </>
      )}
    </div>
  );
}
