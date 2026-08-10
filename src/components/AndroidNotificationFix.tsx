"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { isAndroidDevice, isStandalonePWA } from "@/lib/push-support";

const ACK_KEY = "android-bg-push-configured";
const HEADS_UP_ACK_KEY = "android-heads-up-configured";

type AndroidOem = "samsung" | "xiaomi" | "huawei" | "oppo" | "pixel" | "other";

export function detectOem(): AndroidOem {
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

/** Samsung One UI — Fold / Galaxy exact labels for shade-only (no banner). */
export function SamsungHeadsUpGuide({ showVerify = true }: { showVerify?: boolean }) {
  const appName = isStandalonePWA() ? "Rally Timer" : "Chrome";
  return (
    <div className="space-y-3 text-sm">
      <p className="text-rally-accent font-bold text-xs tracking-wide">SAMSUNG / GALAXY FOLD</p>
      <h3 className="font-bold text-rally-text text-base">
        Turn on Sound and pop-up (brief banner)
      </h3>
      <p className="text-rally-muted text-xs leading-relaxed">
        If the alert only appears in the quick panel / notification shade, One UI has the category
        set to <span className="font-bold">Sound</span> (or Silent) without{" "}
        <span className="font-bold">pop-up</span>. Apps cannot override this.
      </p>

      <div className="p-3 rounded-lg bg-rally-bg border border-rally-border space-y-2">
        <p className="font-bold text-rally-text text-xs">Fastest way (from a test alert)</p>
        <ol className="list-decimal list-inside space-y-2 text-rally-text text-xs leading-relaxed">
          <li>
            In Rally Timer, tap <span className="font-bold">Send test notification</span>
          </li>
          <li>Swipe down to open the shade</li>
          <li>
            <span className="font-bold">Long-press</span> the Rally alert →{" "}
            <span className="font-bold">Settings</span> (gear)
          </li>
          <li>
            Set style to{" "}
            <span className="font-bold text-rally-accent">Sound and pop-up</span> — not Sound, not
            Silent
          </li>
          <li>
            If you see categories: open <span className="font-bold">General</span> (or the site
            name) → turn <span className="font-bold text-rally-accent">Show as pop-up</span> ON
          </li>
          <li>Send another test with Whiteout open — you should get a brief banner</li>
        </ol>
      </div>

      <div className="p-3 rounded-lg bg-rally-bg border border-rally-border space-y-2">
        <p className="font-bold text-rally-text text-xs">From Samsung Settings</p>
        <ol className="list-decimal list-inside space-y-2 text-rally-muted text-xs leading-relaxed">
          <li>
            Settings → Notifications → Advanced settings → turn on{" "}
            <span className="font-bold text-rally-text">Manage notification categories for each app</span>
          </li>
          <li>
            Settings → Apps →{" "}
            <span className="font-bold text-rally-text">{appName}</span>
            {isStandalonePWA() ? " (also check Chrome)" : " (or Rally Timer if installed)"}
          </li>
          <li>Notifications → allowed</li>
          <li>
            Notification categories → <span className="font-bold text-rally-text">General</span>{" "}
            (tap the text, not just the switch)
          </li>
          <li>
            Style: <span className="font-bold text-rally-text">Sound and pop-up</span> / Show as
            pop-up ON
          </li>
        </ol>
      </div>

      {showVerify && (
        <p className="text-rally-muted text-[11px] leading-relaxed">
          Fold tip: test on the screen you play on (cover or open). Also disable Do Not Disturb /
          Bedtime, and set Chrome + Rally Timer battery to{" "}
          <span className="font-bold text-rally-text">Unrestricted</span>.
        </p>
      )}
    </div>
  );
}

/** Pixel-first copy — exact stock Android labels. */
export function PixelHeadsUpGuide({ showVerify = true }: { showVerify?: boolean }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-rally-accent font-bold text-xs tracking-wide">GOOGLE PIXEL</p>
      <h3 className="font-bold text-rally-text text-base">
        Turn on Alerting + Pop on screen
      </h3>
      <p className="text-rally-muted text-xs leading-relaxed">
        On Pixel, tray-only alerts mean the category is <span className="font-bold">Silent</span> or
        Alerting without <span className="font-bold">Pop on screen</span>. Rally Timer cannot change
        this for you.
      </p>

      <div className="p-3 rounded-lg bg-rally-bg border border-rally-border space-y-2">
        <p className="font-bold text-rally-text text-xs">Fastest way (from a test alert)</p>
        <ol className="list-decimal list-inside space-y-2 text-rally-text text-xs leading-relaxed">
          <li>
            In Rally Timer, tap <span className="font-bold">Send test notification</span>
          </li>
          <li>Swipe down from the top to open the shade</li>
          <li>
            On the Rally alert, swipe it slightly <span className="font-bold">left or right</span>{" "}
            and tap the <span className="font-bold">gear</span> (or long-press → Settings)
          </li>
          <li>
            Choose <span className="font-bold text-rally-accent">Alerting</span> — not Silent
          </li>
          <li>
            Tap that category again and turn{" "}
            <span className="font-bold text-rally-accent">Pop on screen</span> ON
            (also leave Sound / Vibrate on)
          </li>
          <li>Send another test while Whiteout is open — you should see a banner</li>
        </ol>
      </div>

      <div className="p-3 rounded-lg bg-rally-bg border border-rally-border space-y-2">
        <p className="font-bold text-rally-text text-xs">From Pixel Settings</p>
        <ol className="list-decimal list-inside space-y-2 text-rally-muted text-xs leading-relaxed">
          <li>
            Settings → Apps →{" "}
            <span className="font-bold text-rally-text">
              {isStandalonePWA() ? "Rally Timer" : "Chrome"}
            </span>
            {isStandalonePWA() ? " (also check Chrome if listed)" : " (or Rally Timer if installed)"}
          </li>
          <li>Notifications → allow notifications</li>
          <li>Tap the category (often General / Sites / the site name)</li>
          <li>
            Set to <span className="font-bold text-rally-text">Alerting</span>
          </li>
          <li>
            Turn on <span className="font-bold text-rally-text">Pop on screen</span>
          </li>
        </ol>
      </div>

      {showVerify && (
        <p className="text-rally-muted text-[11px] leading-relaxed">
          Still tray-only after the first alert? Swipe away “Rally Timer Started” if it is still
          sitting in the shade — Pixel often blocks the next banner while an earlier one is up.
          Also check Do Not Disturb / Bedtime mode.
        </p>
      )}
    </div>
  );
}

const HEADS_UP_STEPS: Record<AndroidOem, { title: string; steps: string[] }> = {
  samsung: {
    title: "Samsung — Sound and pop-up",
    steps: [
      "Settings → Notifications → Advanced settings → enable Manage notification categories for each app",
      "Long-press a Rally alert in the shade → Settings",
      "Set to Sound and pop-up (not Sound, not Silent)",
      "Categories → General → Show as pop-up ON",
      "Apps → Chrome and Rally Timer → Battery → Unrestricted",
    ],
  },
  xiaomi: {
    title: "Xiaomi — floating notifications",
    steps: [
      "Long-press the notification in the shade → gear",
      "Enable Floating notification / Lock screen / Sound",
      "Settings → Notifications → Rally Timer or Chrome → allow Floating notifications",
    ],
  },
  huawei: {
    title: "Huawei — banners",
    steps: [
      "Long-press the notification → Notification settings",
      "Enable Banners (heads-up) and Sound",
    ],
  },
  oppo: {
    title: "OPPO / OnePlus — topscreen",
    steps: [
      "Long-press the notification → Manage / Settings",
      "Set importance to High / Enable Topscreen floating",
    ],
  },
  pixel: {
    title: "Pixel — Alerting + Pop on screen",
    steps: [
      "Send a test → swipe down → swipe the alert left/right → gear",
      "Tap Alerting (not Silent)",
      "Open the category → turn Pop on screen ON",
      "Settings → Apps → Rally Timer or Chrome → Notifications → same",
    ],
  },
  other: {
    title: "Android — Alerting / Pop on screen",
    steps: [
      "Pull down the shade → long-press the Rally notification → Settings",
      "Set importance to Alerting / High (not Silent)",
      "Turn on Pop on screen / Banner if shown",
    ],
  },
};

const BATTERY_STEPS: Record<AndroidOem, { title: string; steps: string[] }> = {
  samsung: {
    title: "Samsung battery",
    steps: [
      "Settings → Apps → Chrome → Battery → Unrestricted",
      "Same for Rally Timer if listed",
    ],
  },
  xiaomi: {
    title: "Xiaomi battery",
    steps: ["Settings → Apps → Chrome → Battery saver → No restrictions"],
  },
  huawei: {
    title: "Huawei battery",
    steps: ["Chrome → Battery → App launch → Manage manually → allow all toggles"],
  },
  oppo: {
    title: "OPPO / OnePlus battery",
    steps: ["Battery → App battery management → Chrome → Don’t optimize"],
  },
  pixel: {
    title: "Pixel battery (for alerts with app closed)",
    steps: [
      "Settings → Apps → Chrome → App battery usage → Unrestricted",
      "If Rally Timer is installed: Apps → Rally Timer → App battery usage → Unrestricted",
      "Turn off Battery Saver while coordinating rallies",
    ],
  },
  other: {
    title: "Battery",
    steps: [
      "Apps → Chrome → Battery → Unrestricted",
      "Same for Rally Timer if it appears separately",
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

/** Tip shown right after a test push on Android (Pixel-specific when detected). */
export function AndroidHeadsUpTip({ visible }: { visible: boolean }) {
  const [oem, setOem] = useState<AndroidOem>("other");
  useEffect(() => {
    setOem(detectOem());
  }, []);

  if (!visible) return null;

  if (oem === "pixel") {
    return (
      <div className="w-full p-3 rounded-lg border border-rally-accent/50 bg-rally-accent/10 text-sm space-y-2">
        <p className="font-bold text-rally-accent">Pixel: only in the top bar?</p>
        <ol className="list-decimal list-inside text-rally-text text-xs space-y-1.5 leading-relaxed">
          <li>Swipe down → on this test alert, swipe left/right → tap the gear</li>
          <li>
            Tap <span className="font-bold">Alerting</span> (not Silent)
          </li>
          <li>
            Open the category → turn <span className="font-bold">Pop on screen</span> ON
          </li>
          <li>Send another test — banner should appear over the game</li>
        </ol>
        <Link href="/fix-notifications#heads-up" className="block text-rally-accent text-xs font-bold">
          Full Pixel steps →
        </Link>
      </div>
    );
  }

  if (oem === "samsung") {
    return (
      <div className="w-full p-3 rounded-lg border border-rally-accent/50 bg-rally-accent/10 text-sm space-y-2">
        <p className="font-bold text-rally-accent">Samsung: only in the quick panel?</p>
        <ol className="list-decimal list-inside text-rally-text text-xs space-y-1.5 leading-relaxed">
          <li>Long-press this test alert in the shade → Settings</li>
          <li>
            Choose <span className="font-bold">Sound and pop-up</span> (not Sound)
          </li>
          <li>
            Categories → General → <span className="font-bold">Show as pop-up</span> ON
          </li>
          <li>Send another test while in Whiteout — brief banner should appear</li>
        </ol>
        <Link href="/fix-notifications#heads-up" className="block text-rally-accent text-xs font-bold">
          Full Samsung / Fold steps →
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full p-3 rounded-lg border border-rally-accent/50 bg-rally-accent/10 text-sm space-y-2">
      <p className="font-bold text-rally-accent">Only in the top bar — not on screen?</p>
      <p className="text-rally-muted text-xs leading-relaxed">
        Set the notification category to{" "}
        <span className="font-bold text-rally-text">Alerting / Pop on screen</span>.
      </p>
      <ol className="list-decimal list-inside text-rally-text text-xs space-y-1">
        <li>Pull down the notification shade</li>
        <li>Long-press the Rally test alert → Settings</li>
        <li>Alerting + Pop on screen ON</li>
      </ol>
      <Link href="/fix-notifications#heads-up" className="block text-rally-accent text-xs font-bold">
        Full pop-on-screen guide →
      </Link>
    </div>
  );
}

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
  const isPixel = oem === "pixel";
  const isSamsung = oem === "samsung";

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
          {isPixel
            ? "Pixel: fix Alerting / Pop on screen →"
            : isSamsung
              ? "Samsung: fix Sound and pop-up →"
              : "Android: fix pop-on-screen / background alerts →"}
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
          {isPixel ? (
            <PixelHeadsUpGuide />
          ) : isSamsung ? (
            <SamsungHeadsUpGuide />
          ) : (
            <>
              <p className="text-rally-warning font-bold text-xs tracking-wide mb-1">
                STEP 1 · POP ON SCREEN (HEADS-UP)
              </p>
              <h3 className="font-bold text-rally-text mb-1">
                Alert in the top bar but not on the screen?
              </h3>
              <p className="text-rally-accent font-bold text-xs mb-1">{headsUp.title}</p>
              <ol className="list-decimal list-inside space-y-1.5 text-rally-muted text-xs mb-3">
                {headsUp.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </>
          )}
          <button
            type="button"
            onClick={openAppNotificationSettings}
            className="w-full py-2.5 mt-3 mb-2 bg-rally-accent text-white font-bold rounded-lg text-sm"
          >
            Open Chrome notification settings
          </button>
          {!ackedHeadsUp && (
            <button
              type="button"
              onClick={markHeadsUpDone}
              className="w-full py-2.5 border border-rally-success text-rally-success font-bold rounded-lg text-sm"
            >
              {isSamsung ? "✓ Sound and pop-up is on" : "✓ Pop on screen is on"}
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
