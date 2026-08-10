"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { isAndroidDevice, isStandalonePWA } from "@/lib/push-support";

const ACK_KEY = "android-bg-push-configured";

type AndroidOem = "samsung" | "xiaomi" | "huawei" | "oppo" | "pixel" | "other";

function detectOem(): AndroidOem {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Samsung|SM-/i.test(ua)) return "samsung";
  if (/Xiaomi|Redmi|POCO|Miui/i.test(ua)) return "xiaomi";
  if (/Huawei|Honor|HUAWEI/i.test(ua)) return "huawei";
  if (/OPPO|Realme|OnePlus|ColorOS|Oxygen/i.test(ua)) return "oppo";
  if (/Pixel|nexus/i.test(ua)) return "pixel";
  return "other";
}

function openAndroidIntent(intentUrl: string) {
  // Intent URLs only work on Android browsers; fail soft elsewhere.
  window.location.href = intentUrl;
}

const OEM_STEPS: Record<AndroidOem, { title: string; steps: string[] }> = {
  samsung: {
    title: "Samsung",
    steps: [
      "Settings → Apps → Chrome → Battery → set to Unrestricted",
      "Also open Rally Timer (the installed app) → Battery → Unrestricted",
      "Settings → Battery → Background usage limits → remove Chrome from Sleeping / Deep sleeping",
      "Settings → Notifications → App notifications → Chrome → Allow (and Rally Timer if listed)",
    ],
  },
  xiaomi: {
    title: "Xiaomi / Redmi / POCO",
    steps: [
      "Settings → Apps → Manage apps → Chrome → Battery saver → No restrictions",
      "Chrome → Other permissions → Display pop-up windows → Allow",
      "Lock Chrome in Recents (pull down on the app card → lock)",
      "Autostart → enable for Chrome if shown",
    ],
  },
  huawei: {
    title: "Huawei / Honor",
    steps: [
      "Settings → Apps → Chrome → Battery → App launch → Manage manually → allow Auto-launch, Secondary launch, Run in background",
      "Settings → Battery → App launch → same for Rally Timer if listed",
      "Disable Power saving / Ultra power saving while playing",
    ],
  },
  oppo: {
    title: "OPPO / Realme / OnePlus",
    steps: [
      "Settings → Battery → App battery management → Chrome → Don’t optimize / Allow background",
      "Settings → Apps → Chrome → Notifications → Allow all",
      "Lock Chrome in recent apps",
    ],
  },
  pixel: {
    title: "Pixel / stock Android",
    steps: [
      "Settings → Apps → Chrome → Notifications → Allow",
      "Settings → Apps → Chrome → App battery usage → Unrestricted",
      "Turn off Battery Saver while coordinating rallies",
    ],
  },
  other: {
    title: "Android",
    steps: [
      "Settings → Apps → Chrome → Notifications → Allow",
      "Settings → Apps → Chrome → Battery → Unrestricted / Allow background usage",
      "Remove Chrome from any “Sleeping apps” / battery optimization list",
      "If you installed Rally Timer, set the same battery setting on that app too",
    ],
  },
};

/** Opens Chrome app details / battery screens when the OS allows it. */
export function openChromeAppSettings() {
  openAndroidIntent(
    "intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;data=package:com.android.chrome;end"
  );
}

export function openBatteryOptimizationSettings() {
  openAndroidIntent(
    "intent:#Intent;action=android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS;end"
  );
}

export function openAppNotificationSettings() {
  openAndroidIntent(
    "intent:#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;S.android.provider.extra.APP_PACKAGE=com.android.chrome;end"
  );
}

export function hasAckedAndroidPushFix(): boolean {
  try {
    return localStorage.getItem(ACK_KEY) === "1";
  } catch {
    return false;
  }
}

export function ackAndroidPushFix() {
  try {
    localStorage.setItem(ACK_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearAndroidPushFixAck() {
  try {
    localStorage.removeItem(ACK_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Compact checklist shown after enabling notifications on Android, and on settings.
 * Web apps cannot flip OEM battery switches — we open system screens + guide steps.
 */
export function AndroidNotificationFix({
  forceShow = false,
  compact = false,
}: {
  forceShow?: boolean;
  compact?: boolean;
}) {
  const [isAndroid, setIsAndroid] = useState(false);
  const [acked, setAcked] = useState(true);
  const oem = useMemo(() => detectOem(), []);
  const guide = OEM_STEPS[oem];

  useEffect(() => {
    setIsAndroid(isAndroidDevice());
    setAcked(hasAckedAndroidPushFix());
  }, []);

  const markDone = useCallback(() => {
    ackAndroidPushFix();
    setAcked(true);
  }, []);

  if (!isAndroid && !forceShow) return null;
  if (acked && !forceShow && compact) {
    return (
      <p className="text-center text-xs mt-2">
        <Link href="/fix-notifications" className="text-rally-muted hover:text-rally-accent">
          Android alerts delayed? Fix background settings →
        </Link>
      </p>
    );
  }
  if (acked && !forceShow) return null;

  return (
    <section
      className={`rounded-lg border text-sm ${
        compact
          ? "mt-3 p-3 border-rally-warning/50 bg-rally-warning/10"
          : "p-4 border-rally-warning bg-rally-warning/10"
      }`}
    >
      <p className="text-rally-warning font-bold text-xs tracking-wide mb-1">
        ANDROID · REQUIRED FOR BACKGROUND ALERTS
      </p>
      <h3 className="font-bold text-rally-text mb-1">
        Stop battery settings from silencing throws
      </h3>
      <p className="text-rally-muted text-xs mb-3 leading-relaxed">
        Android often pauses Chrome until you reopen the app. Set Chrome (and Rally Timer) to{" "}
        <span className="font-bold text-rally-text">Unrestricted</span> battery so throw alerts
        arrive with the app closed.
        {isStandalonePWA() ? " You are in the installed app — good." : " Install the app first, then fix battery."}
      </p>

      <div className="grid grid-cols-1 gap-2 mb-3">
        <button
          type="button"
          onClick={openAppNotificationSettings}
          className="w-full py-2.5 bg-rally-accent text-white font-bold rounded-lg text-sm"
        >
          Open Chrome notification settings
        </button>
        <button
          type="button"
          onClick={openChromeAppSettings}
          className="w-full py-2.5 bg-rally-surface border border-rally-border text-rally-text font-bold rounded-lg text-sm"
        >
          Open Chrome app info
        </button>
        <button
          type="button"
          onClick={openBatteryOptimizationSettings}
          className="w-full py-2.5 bg-rally-surface border border-rally-border text-rally-text font-bold rounded-lg text-sm"
        >
          Open battery optimization list
        </button>
      </div>

      <p className="text-rally-accent font-bold text-xs mb-1">{guide.title} checklist</p>
      <ol className="list-decimal list-inside space-y-1.5 text-rally-muted text-xs mb-3">
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={markDone}
          className="w-full py-2.5 border border-rally-success text-rally-success font-bold rounded-lg text-sm"
        >
          ✓ I set battery to Unrestricted
        </button>
        <Link
          href="/fix-notifications"
          className="text-center text-rally-accent text-xs font-bold"
        >
          Full troubleshooting page →
        </Link>
      </div>
    </section>
  );
}
