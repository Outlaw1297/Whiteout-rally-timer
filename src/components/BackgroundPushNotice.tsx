"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  hasAckedAndroidPushFix,
  openChromeAppSettings,
  openAppNotificationSettings,
} from "@/components/AndroidNotificationFix";
import { isAndroidDevice, isStandalonePWA } from "@/lib/push-support";

/**
 * When an Android user backgrounds the app without fixing battery settings,
 * remind them — "works in foreground only" is almost always Unrestricted battery.
 */
export function BackgroundPushNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isAndroidDevice()) return;

    const refresh = () => {
      if (hasAckedAndroidPushFix()) {
        setShow(false);
        return;
      }
      // Show whenever they're on Android and haven't confirmed battery fix.
      setShow(true);
    };

    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  if (!show) return null;

  return (
    <div className="mx-auto max-w-lg px-4 pt-2">
      <div className="rounded-lg border border-rally-warning/60 bg-rally-warning/10 p-3 text-sm">
        <p className="font-bold text-rally-warning text-xs tracking-wide mb-1">
          ANDROID · BACKGROUND ALERTS
        </p>
        <p className="text-rally-text text-xs leading-relaxed mb-2">
          If alerts only work while Rally Timer is open, Chrome is being paused. Set{" "}
          <span className="font-bold">
            {isStandalonePWA() ? "Rally Timer and Chrome" : "Chrome"}
          </span>{" "}
          → Battery → <span className="font-bold">Unrestricted</span>, then leave the app and
          send a test.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={openChromeAppSettings}
            className="w-full py-2 bg-rally-accent text-white font-bold rounded-lg text-xs"
          >
            Open Chrome app info
          </button>
          <button
            type="button"
            onClick={openAppNotificationSettings}
            className="w-full py-2 bg-rally-surface border border-rally-border font-bold rounded-lg text-xs"
          >
            Open notification settings
          </button>
          <Link
            href="/fix-notifications"
            className="text-center text-rally-accent text-xs font-bold"
          >
            Full background-fix steps →
          </Link>
        </div>
      </div>
    </div>
  );
}
