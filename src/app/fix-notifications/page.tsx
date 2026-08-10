"use client";

import Link from "next/link";
import {
  AndroidNotificationFix,
  openAppNotificationSettings,
  openBatteryOptimizationSettings,
  openChromeAppSettings,
} from "@/components/AndroidNotificationFix";

export default function FixNotificationsPage() {
  return (
    <main className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      <Link href="/" className="text-rally-muted text-sm hover:text-rally-accent">
        ← Home
      </Link>

      <p className="text-rally-warning text-[10px] font-bold tracking-widest mt-4 mb-1">
        ANDROID FIX
      </p>
      <h1 className="text-2xl font-bold mb-2">Make rally alerts pop on screen</h1>
      <p className="text-rally-muted text-sm mb-6 leading-relaxed">
        If the alert only appears as an icon in the top bar (notification shade) and never banners
        over your game, Android has the channel set to “sound only.” Web apps cannot change that
        automatically — use the steps below once.
      </p>

      <section
        id="heads-up"
        className="mb-6 p-4 rounded-lg border-2 border-rally-accent bg-rally-accent/10 space-y-3 text-sm scroll-mt-20"
      >
        <p className="text-rally-accent font-bold text-xs tracking-wide">MOST COMMON FIX</p>
        <h2 className="font-bold text-lg text-rally-text">Shows in top bar, not on screen</h2>
        <ol className="list-decimal list-inside text-rally-text space-y-2 text-sm">
          <li>
            Send a test notification from Rally Timer (or wait for any rally alert)
          </li>
          <li>
            Swipe down from the top to open the notification shade
          </li>
          <li>
            <span className="font-bold">Long-press</span> the Rally / Chrome notification
          </li>
          <li>
            Tap <span className="font-bold">Settings</span> / the gear
          </li>
          <li>
            Set the category to{" "}
            <span className="font-bold text-rally-accent">Alerting</span> (Pixel),{" "}
            <span className="font-bold text-rally-accent">Sound and pop-up</span> (Samsung), or
            enable <span className="font-bold text-rally-accent">Pop on screen / Banners</span>
          </li>
          <li>Send another test — it should banner over whatever app is open</li>
        </ol>
        <button
          type="button"
          onClick={openAppNotificationSettings}
          className="w-full py-3 bg-rally-accent text-white font-bold rounded-lg"
        >
          Open notification settings
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

      <section className="mt-6 p-4 rounded-lg border border-rally-border bg-rally-surface text-sm space-y-2">
        <h2 className="font-bold text-rally-accent">Verify</h2>
        <ol className="list-decimal list-inside text-rally-muted text-xs space-y-1.5">
          <li>Send test notification</li>
          <li>Leave Rally Timer and open Whiteout (or the home screen)</li>
          <li>You should see a banner on top of the screen, not only a shade icon</li>
        </ol>
      </section>

      <p className="mt-6 text-center">
        <Link href="/install" className="text-rally-accent text-sm font-bold">
          Need to install the app first? →
        </Link>
      </p>
    </main>
  );
}
