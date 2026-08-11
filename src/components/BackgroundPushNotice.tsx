"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Battery, Bell } from "lucide-react";
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
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isAndroidDevice()) return;

    const refresh = () => {
      if (hasAckedAndroidPushFix()) {
        setShow(false);
        return;
      }
      setShow(true);
    };

    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  if (!show) return null;
  if (pathname === "/onboarding" || pathname === "/install" || pathname === "/fix-notifications") {
    return null;
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-2">
      <div className="rounded-xl border border-rally-warning/60 bg-rally-warning/10 p-3 text-sm">
        <p className="font-semibold text-rally-warning text-xs tracking-wide mb-1 inline-flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          Android · Background Alerts
        </p>
        <p className="text-rally-text text-xs leading-relaxed mb-2">
          If alerts only work while Rally Timer is open, Chrome is being paused. Set{" "}
          <span className="font-semibold">
            {isStandalonePWA() ? "Rally Timer and Chrome" : "Chrome"}
          </span>{" "}
          → Battery → <span className="font-semibold">Unrestricted</span>, then leave the app and
          send a test.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={openChromeAppSettings}
            className="btn-primary w-full !min-h-[36px] text-xs gap-1"
          >
            <Battery className="h-3.5 w-3.5" aria-hidden />
            Open Chrome app info
          </button>
          <button
            type="button"
            onClick={openAppNotificationSettings}
            className="btn-secondary w-full !min-h-[36px] text-xs gap-1"
          >
            <Bell className="h-3.5 w-3.5" aria-hidden />
            Open notification settings
          </button>
          <Link
            href="/fix-notifications"
            className="nav-link text-xs font-semibold justify-center"
          >
            Full background-fix steps →
          </Link>
        </div>
      </div>
    </div>
  );
}
