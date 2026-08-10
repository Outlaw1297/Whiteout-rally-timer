"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePushNotificationsContext } from "@/components/PushNotificationsProvider";
import { usePushCalibration } from "@/hooks/usePushCalibration";
import {
  AndroidNotificationFix,
  clearAndroidPushFixAck,
} from "@/components/AndroidNotificationFix";
import { isAndroidDevice } from "@/lib/push-support";

export function NotificationButton({ onStatusChange }: { onStatusChange?: () => void }) {
  const {
    status,
    loading,
    testLoading,
    enableNotifications,
    disableNotifications,
    sendTestNotification,
    isSubscribed,
    checkStatus,
    lastError,
  } = usePushNotificationsContext();

  const {
    calibration,
    runCalibration,
    dismissCalibration,
    loadCalibrationStatus,
    isCalibrating,
  } = usePushCalibration();

  const [error, setError] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);
  const [showAndroidFix, setShowAndroidFix] = useState(false);

  useEffect(() => {
    if (isSubscribed && isAndroidDevice()) setShowAndroidFix(true);
  }, [isSubscribed]);

  useEffect(() => {
    if (isSubscribed) {
      loadCalibrationStatus();
    }
  }, [isSubscribed, loadCalibrationStatus]);

  useEffect(() => {
    if (lastError) setError(lastError);
  }, [lastError]);

  const handleEnable = async () => {
    setError(null);
    dismissCalibration();
    const result = await enableNotifications();
    if (!result.ok) {
      setError(result.error || "Could not enable notifications.");
      return;
    }
    if (isAndroidDevice()) {
      clearAndroidPushFixAck();
      setShowAndroidFix(true);
    }
    onStatusChange?.();
    await runCalibration();
    onStatusChange?.();
  };

  const handleDisable = async () => {
    setError(null);
    dismissCalibration();
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
      setError(msg);
    }
  };

  const handleRecalibrate = async () => {
    setError(null);
    await checkStatus();
    await runCalibration();
    onStatusChange?.();
  };

  if (status === "checking") {
    return (
      <div className="text-rally-muted text-sm text-center">Checking notification support…</div>
    );
  }

  if (status === "ios-install") {
    return (
      <div className="text-sm space-y-3">
        <p className="text-rally-accent font-bold text-center">Install the app to enable alerts</p>
        <p className="text-rally-muted text-xs text-center">
          iPhone only gets rally pushes from the home-screen app (Safari, iOS 16.4+).
        </p>
        <ol className="text-rally-text text-xs space-y-2 list-decimal list-inside">
          <li>Tap Share (square with ↑) at the bottom of Safari</li>
          <li>Scroll → <span className="font-bold">Add to Home Screen</span> → Add</li>
          <li>Open <span className="font-bold">Rally Timer</span> from the home screen</li>
          <li>Return here and tap Enable Rally Notifications</li>
        </ol>
        <a href="/install" className="block text-center text-rally-accent text-xs font-bold">
          Open step-by-step install guide →
        </a>
      </div>
    );
  }

  if (status === "ios-use-safari") {
    return (
      <div className="text-sm space-y-3">
        <p className="text-rally-warning font-bold text-center">Open in Safari to enable alerts</p>
        <p className="text-rally-muted text-xs text-center">
          Chrome and other browsers on iPhone cannot install or receive Web Push. Use Safari.
        </p>
        <ol className="text-rally-text text-xs space-y-2 list-decimal list-inside">
          <li>Copy the link from the install guide</li>
          <li>Open <span className="font-bold">Safari</span> and paste it</li>
          <li>Share → <span className="font-bold">Add to Home Screen</span></li>
        </ol>
        <a href="/install" className="block text-center text-rally-accent text-xs font-bold">
          Open install guide →
        </a>
      </div>
    );
  }

  if (status === "unsupported") {
    return (
      <div className="text-rally-muted text-sm text-center">
        Push notifications not supported in this browser
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="text-rally-danger text-sm text-center space-y-2">
        <p>Notifications blocked for this site.</p>
        <p className="text-rally-muted text-xs">
          In Edge: lock icon in the address bar → Notifications → Allow. Also check Windows
          Settings → System → Notifications → Microsoft Edge.
        </p>
      </div>
    );
  }

  if (status === "stale") {
    return (
      <div className="flex flex-col items-center gap-3 w-full">
        <p className="text-rally-warning text-sm text-center font-bold">
          Registration expired — re-enable notifications
        </p>
        <p className="text-rally-muted text-xs text-center">
          Edge and Chrome on desktop both support rally alerts. If Enable fails, allow
          notifications for this site (lock icon in the address bar) and confirm Windows
          notifications are on for the browser.
        </p>
        <button
          onClick={handleEnable}
          disabled={loading || isCalibrating}
          className="w-full py-4 px-6 bg-rally-accent hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-lg rounded-lg transition-colors"
        >
          {loading ? "ENABLING..." : "ENABLE RALLY NOTIFICATIONS"}
        </button>
        {error && <p className="text-rally-danger text-xs text-center">{error}</p>}
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

      {(isCalibrating || calibration.phase === "complete" || calibration.phase === "partial") && (
        <div
          className={`w-full p-3 rounded-lg border text-sm ${
            calibration.phase === "complete"
              ? "bg-rally-success/10 border-rally-success/40"
              : calibration.phase === "partial"
                ? "bg-rally-warning/10 border-rally-warning/40"
                : "bg-rally-surface border-rally-border"
          }`}
        >
          {calibration.phase === "running" && (
            <>
              <p className="font-bold text-rally-accent">Calibrating notification timing</p>
              <p className="text-rally-muted text-xs mt-1">
                {calibration.message ||
                  "Measuring how fast this device receives alerts…"}
              </p>
              <p className="text-rally-text text-xs mt-2 font-mono">
                Step {calibration.received} of {calibration.total}
              </p>
            </>
          )}
          {calibration.phase === "complete" && (
            <>
              <p className="font-bold text-rally-success">✓ Calibration complete</p>
              <p className="text-rally-muted text-xs mt-1">
                {calibration.message ||
                  `This device will receive rally alerts about ${calibration.deliveryLeadMs}ms early.`}
              </p>
            </>
          )}
          {calibration.phase === "partial" && (
            <>
              <p className="font-bold text-rally-warning">Calibration partial</p>
              <p className="text-rally-muted text-xs mt-1">{calibration.message}</p>
            </>
          )}
          {calibration.phase !== "running" && (
            <button
              type="button"
              onClick={dismissCalibration}
              className="mt-2 text-rally-muted text-xs underline"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {calibration.phase === "failed" && calibration.message && (
        <div className="w-full p-3 rounded-lg border border-rally-danger/40 bg-rally-danger/10 text-sm">
          <p className="font-bold text-rally-danger">Calibration incomplete</p>
          <p className="text-rally-muted text-xs mt-1">{calibration.message}</p>
          <button
            type="button"
            onClick={handleRecalibrate}
            className="mt-2 text-rally-accent text-xs font-bold"
          >
            Try calibration again
          </button>
        </div>
      )}

      {!isSubscribed ? (
        <>
          <button
            onClick={handleEnable}
            disabled={loading || isCalibrating}
            className="w-full py-4 px-6 bg-rally-accent hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-lg rounded-lg transition-colors"
          >
            {loading
              ? "ENABLING..."
              : isCalibrating
                ? "CALIBRATING..."
                : "ENABLE RALLY NOTIFICATIONS"}
          </button>
          <p className="text-rally-muted text-xs text-center px-2">
            Includes a quick timing calibration for this device (about 5 seconds). Rally
            alerts work in the background after setup.
          </p>
        </>
      ) : (
        <>
          <p className="text-rally-success text-sm font-bold">✓ NOTIFICATIONS ENABLED</p>
          {calibration.phase === "idle" && calibration.learnedLeadMs != null && (
            <p className="text-rally-muted text-xs text-center">
              Device timing: ~{calibration.learnedLeadMs}ms lead
            </p>
          )}
          <button
            onClick={handleTest}
            disabled={testLoading || isCalibrating}
            className="w-full py-3 px-6 bg-rally-surface border border-rally-border hover:border-rally-accent text-rally-text font-bold text-sm rounded-lg transition-colors"
          >
            {testLoading ? "SENDING..." : testSent ? "✓ TEST SENT" : "SEND TEST NOTIFICATION"}
          </button>
          <button
            onClick={handleRecalibrate}
            disabled={isCalibrating}
            className="w-full py-2 px-6 text-rally-accent text-xs font-bold"
          >
            {isCalibrating ? "CALIBRATING..." : "RECALIBRATE TIMING"}
          </button>
          <button
            onClick={handleDisable}
            disabled={loading || isCalibrating}
            className="w-full py-2 px-6 text-rally-muted hover:text-rally-danger text-xs transition-colors"
          >
            {loading ? "DISABLING..." : "Disable notifications"}
          </button>
        </>
      )}

      {error && <p className="text-rally-danger text-xs text-center">{error}</p>}

      {showAndroidFix && isSubscribed && <AndroidNotificationFix />}
      {isAndroidDevice() && isSubscribed && (
        <Link
          href="/fix-notifications"
          className="text-rally-muted text-xs hover:text-rally-accent text-center"
        >
          Alerts only when app is open? Fix Android settings →
        </Link>
      )}
    </div>
  );
}
