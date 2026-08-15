"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, Check, Circle } from "lucide-react";
import { usePushNotificationsContext } from "@/components/PushNotificationsProvider";
import { usePushCalibration } from "@/hooks/usePushCalibration";
import {
  AndroidNotificationFix,
  AndroidHeadsUpTip,
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
  const [showHeadsUpTip, setShowHeadsUpTip] = useState(false);

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
      if (isAndroidDevice()) setShowHeadsUpTip(true);
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
        <a href="/install" className="block text-center nav-link text-xs font-semibold justify-center">
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
        <a href="/install" className="block text-center nav-link text-xs font-semibold justify-center">
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
          className="btn-primary w-full !text-lg"
        >
          {loading ? "Enabling..." : "Enable Rally Notifications"}
        </button>
        {error && <p className="text-rally-danger text-xs text-center">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-rally-muted text-[11px] font-semibold uppercase tracking-wide">Notifications</span>
        {isSubscribed ? (
          <span className="text-rally-success font-semibold inline-flex items-center gap-1">
            <Check className="h-3.5 w-3.5" aria-hidden />
            Enabled
          </span>
        ) : (
          <span className="text-rally-muted font-semibold inline-flex items-center gap-1">
            <Circle className="h-3 w-3" aria-hidden />
            Disabled
          </span>
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
              <p className="font-semibold text-rally-success inline-flex items-center gap-1.5">
                <Check className="h-4 w-4" aria-hidden />
                Calibration complete
              </p>
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
            className="btn-primary w-full !text-base"
          >
            {loading
              ? "Enabling..."
              : isCalibrating
                ? "Calibrating..."
                : "Enable Rally Notifications"}
          </button>
          <p className="text-rally-muted text-xs text-center px-2">
            Includes one visible timing-check notification. Rally alerts work in the
            background after setup.
          </p>
        </>
      ) : (
        <>
          <p className="text-rally-success text-sm font-semibold inline-flex items-center gap-1.5">
            <Bell className="h-4 w-4" aria-hidden />
            Notifications enabled
          </p>
          {calibration.phase === "idle" && calibration.learnedLeadMs != null && (
            <p className="text-rally-muted text-xs text-center">
              Device timing: ~{calibration.learnedLeadMs}ms lead
            </p>
          )}
          <button
            onClick={handleTest}
            disabled={testLoading || isCalibrating}
            className="btn-secondary w-full text-sm"
          >
            {testLoading ? "Sending..." : testSent ? (
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4" aria-hidden />
                Test sent
              </span>
            ) : "Send Test Notification"}
          </button>
          <AndroidHeadsUpTip visible={showHeadsUpTip} />
          <button
            onClick={handleRecalibrate}
            disabled={isCalibrating}
            className="btn-ghost w-full text-xs font-semibold text-rally-ice"
          >
            {isCalibrating ? "Calibrating..." : "Recalibrate Timing"}
          </button>
          <button
            onClick={handleDisable}
            disabled={loading || isCalibrating}
            className="btn-ghost w-full text-xs text-rally-muted hover:text-rally-danger"
          >
            {loading ? "Disabling..." : (
              <span className="inline-flex items-center gap-1.5">
                <BellOff className="h-3.5 w-3.5" aria-hidden />
                Disable notifications
              </span>
            )}
          </button>
        </>
      )}

      {error && <p className="text-rally-danger text-xs text-center">{error}</p>}

      {showAndroidFix && isSubscribed && <AndroidNotificationFix />}
      {isAndroidDevice() && isSubscribed && (
        <Link
          href="/fix-notifications"
          className="nav-link text-xs justify-center"
        >
          Alerts only when app is open? Fix Android settings →
        </Link>
      )}
    </div>
  );
}
