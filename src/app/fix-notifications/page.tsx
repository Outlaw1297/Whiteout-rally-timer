"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AndroidNotificationFix,
  PixelHeadsUpGuide,
  detectOem,
  openAppNotificationSettings,
  openBatteryOptimizationSettings,
  openChromeAppSettings,
} from "@/components/AndroidNotificationFix";

export default function FixNotificationsPage() {
  const [oem, setOem] = useState<ReturnType<typeof detectOem>>("other");
  useEffect(() => {
    setOem(detectOem());
  }, []);

  const isPixel = oem === "pixel";

  return (
    <main className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      <Link href="/" className="text-rally-muted text-sm hover:text-rally-accent">
        ← Home
      </Link>

      <p className="text-rally-warning text-[10px] font-bold tracking-widest mt-4 mb-1">
        {isPixel ? "GOOGLE PIXEL" : "ANDROID FIX"}
      </p>
      <h1 className="text-2xl font-bold mb-2">
        {isPixel ? "Pixel: make alerts pop on screen" : "Make rally alerts pop on screen"}
      </h1>
      <p className="text-rally-muted text-sm mb-6 leading-relaxed">
        {isPixel
          ? "Your Pixel is receiving the alert (top bar icon) but the category is not set to Alerting with Pop on screen. Do this once:"
          : "If the alert only appears as an icon in the top bar, Android has the channel set to sound/silent only. Use the steps below once."}
      </p>

      <section
        id="heads-up"
        className="mb-6 p-4 rounded-lg border-2 border-rally-accent bg-rally-accent/10 space-y-3 text-sm scroll-mt-20"
      >
        {isPixel ? (
          <PixelHeadsUpGuide />
        ) : (
          <>
            <p className="text-rally-accent font-bold text-xs tracking-wide">MOST COMMON FIX</p>
            <h2 className="font-bold text-lg text-rally-text">Shows in top bar, not on screen</h2>
            <ol className="list-decimal list-inside text-rally-text space-y-2 text-sm">
              <li>Send a test notification from Rally Timer</li>
              <li>Swipe down from the top</li>
              <li>
                <span className="font-bold">Long-press</span> the Rally notification → Settings
              </li>
              <li>
                Set to <span className="font-bold text-rally-accent">Alerting</span> and enable{" "}
                <span className="font-bold text-rally-accent">Pop on screen</span>
              </li>
            </ol>
          </>
        )}
        <button
          type="button"
          onClick={openAppNotificationSettings}
          className="w-full py-3 bg-rally-accent text-white font-bold rounded-lg"
        >
          Open Chrome notification settings
        </button>
      </section>

      <AndroidNotificationFix forceShow />

      <section className="mt-6 p-4 rounded-lg border border-rally-border bg-rally-surface space-y-3 text-sm">
        <h2 className="font-bold text-rally-accent">More settings shortcuts</h2>
        <button
          type="button"
          onClick={openChromeAppSettings}
          className="w-full py-3 bg-rally-bg border border-rally-border font-bold rounded-lg"
        >
          Chrome app info (Battery → Unrestricted)
        </button>
        <button
          type="button"
          onClick={openBatteryOptimizationSettings}
          className="w-full py-3 bg-rally-bg border border-rally-border font-bold rounded-lg"
        >
          Battery optimization list
        </button>
      </section>

      <p className="mt-6 text-center">
        <Link href="/install" className="text-rally-accent text-sm font-bold">
          Need to install the app first? →
        </Link>
      </p>
    </main>
  );
}
