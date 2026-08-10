"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Battery, Bell, Smartphone } from "lucide-react";
import {
  AndroidNotificationFix,
  PixelHeadsUpGuide,
  SamsungHeadsUpGuide,
  detectOem,
  openAppNotificationSettings,
  openBatteryOptimizationSettings,
  openChromeAppSettings,
} from "@/components/AndroidNotificationFix";
import { AppShell, Panel, SectionLabel } from "@/components/ui/AppShell";

export default function FixNotificationsPage() {
  const [oem, setOem] = useState<ReturnType<typeof detectOem>>("other");
  useEffect(() => {
    setOem(detectOem());
  }, []);

  const isPixel = oem === "pixel";
  const isSamsung = oem === "samsung";

  return (
    <AppShell className="page-enter">
      <Link href="/" className="nav-link text-sm gap-1 inline-flex">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Home
      </Link>

      <p className="text-rally-warning text-[10px] font-semibold tracking-widest mt-4 mb-1">
        {isPixel ? "Google Pixel" : isSamsung ? "Samsung / Galaxy Fold" : "Android Fix"}
      </p>
      <h1 className="text-2xl font-bold text-rally-snow mb-2">
        {isPixel
          ? "Pixel: alerts only work when app is open?"
          : isSamsung
            ? "Samsung: alerts only in the quick panel?"
            : "Make rally alerts pop on screen"}
      </h1>
      <p className="text-rally-muted text-sm mb-6 leading-relaxed">
        {isPixel
          ? "If you see alerts inside Rally Timer but nothing when the app is closed or in Whiteout, Pixel is pausing Chrome. Fix battery + Pop on screen below, then test with the app fully closed."
          : isSamsung
            ? "If the alert only shows in the shade / quick panel and never as a brief banner over the game, One UI has pop-up disabled for Chrome/Rally Timer. Fix Sound and pop-up below, then retest."
            : "If the alert only appears as an icon in the top bar, or only while the app is open, use the steps below once."}
      </p>

      <Panel className="mb-6 border-rally-warning/40 bg-rally-warning/10 space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <Battery className="h-4 w-4 text-rally-warning shrink-0" aria-hidden />
          <SectionLabel>Works in App, Not in Background?</SectionLabel>
        </div>
        <ol className="list-decimal list-inside text-rally-text space-y-2 text-xs leading-relaxed mt-2">
          <li>
            Settings → Apps → <span className="font-semibold">Chrome</span> → Battery →{" "}
            <span className="font-semibold">Unrestricted</span>
          </li>
          <li>
            If Rally Timer is installed: Apps → <span className="font-semibold">Rally Timer</span> →
            Battery → <span className="font-semibold">Unrestricted</span>
          </li>
          <li>Turn off Battery Saver / Power saving while coordinating</li>
          <li>
            In Rally Timer: Send test → <span className="font-semibold">fully close</span> the app
            (swipe away) → ask for another test. You must get the banner without reopening.
          </li>
        </ol>
        <button
          type="button"
          onClick={openChromeAppSettings}
          className="btn-primary w-full"
        >
          Open Chrome app info (set Unrestricted)
        </button>
      </Panel>

      <div id="heads-up" className="scroll-mt-20 mb-6">
      <Panel accent className="space-y-3 text-sm">
        {isPixel ? (
          <PixelHeadsUpGuide />
        ) : isSamsung ? (
          <SamsungHeadsUpGuide />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-rally-ice shrink-0" aria-hidden />
              <SectionLabel>Most Common Fix</SectionLabel>
            </div>
            <h2 className="font-bold text-lg text-rally-snow mt-1">Shows in top bar, not on screen</h2>
            <ol className="list-decimal list-inside text-rally-text space-y-2 text-sm">
              <li>Send a test notification from Rally Timer</li>
              <li>Swipe down from the top</li>
              <li>
                <span className="font-semibold">Long-press</span> the Rally notification → Settings
              </li>
              <li>
                Set to <span className="font-semibold text-rally-ice">Alerting</span> and enable{" "}
                <span className="font-semibold text-rally-ice">Pop on screen</span>
              </li>
            </ol>
          </>
        )}
        <button
          type="button"
          onClick={openAppNotificationSettings}
          className="btn-primary w-full"
        >
          Open Chrome notification settings
        </button>
      </Panel>
      </div>

      <AndroidNotificationFix forceShow />

      <Panel className="mt-6 space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-rally-ice shrink-0" aria-hidden />
          <h2 className="font-bold text-rally-ice">More settings shortcuts</h2>
        </div>
        <button
          type="button"
          onClick={openChromeAppSettings}
          className="btn-secondary w-full"
        >
          Chrome app info (Battery → Unrestricted)
        </button>
        <button
          type="button"
          onClick={openBatteryOptimizationSettings}
          className="btn-secondary w-full"
        >
          Battery optimization list
        </button>
      </Panel>

      <p className="mt-6 text-center">
        <Link href="/install" className="nav-link text-sm font-semibold justify-center">
          Need to install the app first? →
        </Link>
      </p>
    </AppShell>
  );
}
