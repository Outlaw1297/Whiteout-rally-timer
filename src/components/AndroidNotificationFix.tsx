"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { isAndroidDevice, isStandalonePWA } from "@/lib/push-support";

const ACK_KEY = "android-bg-push-configured";
const HEADS_UP_ACK_KEY = "android-heads-up-configured";

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
  window.location.href = intentUrl;
}

/** OEM-specific wording for "pop on screen" / heads-up. */
const HEADS_UP_STEPS: Record<AndroidOem, { title: string; steps: string[] }> = {
  samsung: {
    title: "Samsung — turn on pop-up",
    steps: [
      "Pull down the shade and long-press the Rally Timer / Chrome alert",
      "Tap Settings (gear) on that notification",
      "Set category (often “General”) to Sound and pop-up — not Sound only",
      "Or: Settings → Apps → Rally Timer (or Chrome) → Notifications → General → Pop on screen ON",
    ],
  },
  xiaomi: {
    title: "Xiaomi — floating notifications",
    steps: [
      "Long-press the notification in the shade → gear",
      "Enable Floating notification / Lock screen / Sound",
      "Settings → Notifications → Rally Timer or Chrome → allow Floating notifications",
      "Settings → Other permissions → Display pop-up windows → Allow",
    ],
  },
  huawei: {
    title: "Huawei — banners",
    steps: [
      "Long-press the notification → Notification settings",
      "Enable Banners (heads-up) and Sound",
      "Settings → Notifications → Rally Timer / Chrome → Banners ON",
    ],
  },
  oppo: {
    title: "OPPO / OnePlus — topscreen",
    steps: [
      "Long-press the notification → Manage / Settings",
      "Set importance to High / Enable Topscreen floating",
      "Settings → Notifications → Rally Timer / Chrome → Allow floating / Lock screen",
    ],
  },
  pixel: {
    title: "Pixel — Alerting + Pop on screen",
    steps: [
      "Pull down shade → long-press the Rally alert → Settings",
      "Change from Silent / Default to Alerting",
      "Open that category → turn on Pop on screen (and Sound / Vibrate)",
      "Or: Settings → Apps → Rally Timer → Notifications → [category] → Alerting",
    ],
  },
  other: {
    title: "Android — Alerting / Pop on screen",
    steps: [
      "Pull down the top shade and long-press the Rally notification",
      "Tap the gear / Settings for that alert",
      "Set importance to Alerting / High / Urgent (not Silent or Low)",
      "Turn on Pop on screen / Banner / Heads-up if shown",
    ],
  },
};

const BATTERY_STEPS: Record<AndroidOem, { title: string; steps: string[] }> = {
  samsung: {
    title: "Samsung battery",
    steps: [
      "Settings → Apps → Chrome → Battery → Unrestricted",
      "Same for Rally Timer if listed",
      "Remove Chrome from Battery → Background usage limits → Sleeping apps",
    ],
  },
  xiaomi: {
    title: "Xiaomi battery",
    steps: [
      "Settings → Apps → Chrome → Battery saver → No restrictions",
      "Lock Chrome in Recents",
    ],
  },
  huawei: {
    title: "Huawei battery",
    steps: [
      "Chrome → Battery → App launch → Manage manually → allow all three toggles",
    ],
  },
  oppo: {
    title: "OPPO / OnePlus battery",
    steps: [
      "Battery → App battery management → Chrome → Don’t optimize",
    ],
  },
  pixel: {
    title: "Pixel battery",
    steps: [
      "Apps → Chrome → App battery usage → Unrestricted",
    ],
  },
  other: {
    title: "Battery",
    steps: [
      "Apps → Chrome → Battery → Unrestricted / Allow background",
      "Same for the Rally Timer app if it appears separately",
    ],
  },
};

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

export function hasAckedAndroidHeadsUp(): boolean {
  try {
    return localStorage.getItem(HEADS_UP_ACK_KEY) === "1";
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

export function ackAndroidHeadsUp() {
  try {
    localStorage.setItem(HEADS_UP_ACK_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearAndroidPushFixAck() {
  try {
    localStorage.removeItem(ACK_KEY);
    localStorage.removeItem(HEADS_UP_ACK_KEY);
  } catch {
    /* ignore */
  }
}

/** Tip shown right after a test push on Android. */
export function AndroidHeadsUpTip({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="w-full p-3 rounded-lg border border-rally-accent/50 bg-rally-accent/10 text-sm space-y-2">
      <p className="font-bold text-rally-accent">Only in the top bar — not on screen?</p>
      <p className="text-rally-muted text-xs leading-relaxed">
        Delivery works. Android still needs the channel set to{" "}
        <span className="font-bold text-rally-text">Alerting / Pop on screen</span> (Samsung:
        Sound and pop-up). Apps cannot flip this for you.
      </p>
      <ol className="list-decimal list-inside text-rally-text text-xs space-y-1">
        <li>Pull down the notification shade</li>
        <li>Long-press the Rally test alert</li>
        <li>Tap Settings → set to Alerting / Pop on screen</li>
        <li>Send another test — it should banner on the screen</li>
      </ol>
      <Link href="/fix-notifications#heads-up" className="block text-rally-accent text-xs font-bold">
        Full pop-on-screen guide →
      </Link>
    </div>
  );
}

/**
 * Checklist: heads-up first (current pain), then battery for background delivery.
 */
export function AndroidNotificationFix({
  forceShow = false,
  compact = false,
}: {
  forceShow?: boolean;
  compact?: boolean;
}) {
  const [isAndroid, setIsAndroid] = useState(false);
  const [ackedBattery, setAckedBattery] = useState(true);
  const [ackedHeadsUp, setAckedHeadsUp] = useState(true);
  const oem = useMemo(() => detectOem(), []);
  const headsUp = HEADS_UP_STEPS[oem];
  const battery = BATTERY_STEPS[oem];

  useEffect(() => {
    setIsAndroid(isAndroidDevice());
    setAckedBattery(hasAckedAndroidPushFix());
    setAckedHeadsUp(hasAckedAndroidHeadsUp());
  }, []);

  const markHeadsUpDone = useCallback(() => {
    ackAndroidHeadsUp();
    setAckedHeadsUp(true);
  }, []);

  const markBatteryDone = useCallback(() => {
    ackAndroidPushFix();
    setAckedBattery(true);
  }, []);

  if (!isAndroid && !forceShow) return null;

  const allAcked = ackedBattery && ackedHeadsUp;
  if (allAcked && !forceShow && compact) {
    return (
      <p className="text-center text-xs mt-2">
        <Link href="/fix-notifications" className="text-rally-muted hover:text-rally-accent">
          Android: fix pop-on-screen / background alerts →
        </Link>
      </p>
    );
  }
  if (allAcked && !forceShow) return null;

  return (
    <section
      className={`rounded-lg border text-sm space-y-4 ${
        compact
          ? "mt-3 p-3 border-rally-warning/50 bg-rally-warning/10"
          : "p-4 border-rally-warning bg-rally-warning/10"
      }`}
    >
      {(!ackedHeadsUp || forceShow) && (
        <div>
          <p className="text-rally-warning font-bold text-xs tracking-wide mb-1">
            STEP 1 · POP ON SCREEN (HEADS-UP)
          </p>
          <h3 className="font-bold text-rally-text mb-1">
            Alert in the top bar but not on the screen?
          </h3>
          <p className="text-rally-muted text-xs mb-3 leading-relaxed">
            Android defaults many web alerts to “sound only.” You must set the Rally / Chrome
            category to <span className="font-bold text-rally-text">Alerting</span> with{" "}
            <span className="font-bold text-rally-text">Pop on screen</span>.
            {isStandalonePWA() ? " Check the Rally Timer app notification settings." : ""}
          </p>
          <p className="text-rally-accent font-bold text-xs mb-1">{headsUp.title}</p>
          <ol className="list-decimal list-inside space-y-1.5 text-rally-muted text-xs mb-3">
            {headsUp.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <button
            type="button"
            onClick={openAppNotificationSettings}
            className="w-full py-2.5 mb-2 bg-rally-accent text-white font-bold rounded-lg text-sm"
          >
            Open notification settings
          </button>
          {!ackedHeadsUp && (
            <button
              type="button"
              onClick={markHeadsUpDone}
              className="w-full py-2.5 border border-rally-success text-rally-success font-bold rounded-lg text-sm"
            >
              ✓ Pop on screen is on
            </button>
          )}
        </div>
      )}

      {(!ackedBattery || forceShow) && (
        <div className={forceShow || !ackedHeadsUp ? "pt-3 border-t border-rally-border/60" : ""}>
          <p className="text-rally-warning font-bold text-xs tracking-wide mb-1">
            STEP 2 · BACKGROUND DELIVERY
          </p>
          <h3 className="font-bold text-rally-text mb-1">Alerts only after reopening the app?</h3>
          <p className="text-rally-muted text-xs mb-3 leading-relaxed">
            Set Chrome / Rally Timer battery to{" "}
            <span className="font-bold text-rally-text">Unrestricted</span>.
          </p>
          <p className="text-rally-accent font-bold text-xs mb-1">{battery.title}</p>
          <ol className="list-decimal list-inside space-y-1.5 text-rally-muted text-xs mb-3">
            {battery.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="grid grid-cols-1 gap-2 mb-2">
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
          {!ackedBattery && (
            <button
              type="button"
              onClick={markBatteryDone}
              className="w-full py-2.5 border border-rally-success text-rally-success font-bold rounded-lg text-sm"
            >
              ✓ Battery set to Unrestricted
            </button>
          )}
        </div>
      )}

      <Link
        href="/fix-notifications"
        className="block text-center text-rally-accent text-xs font-bold"
      >
        Full troubleshooting page →
      </Link>
    </section>
  );
}
