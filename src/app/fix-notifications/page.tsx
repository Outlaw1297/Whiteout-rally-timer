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
      <h1 className="text-2xl font-bold mb-2">Notifications only when app is open?</h1>
      <p className="text-rally-muted text-sm mb-6 leading-relaxed">
        That almost always means Android is pausing Chrome to save battery. Rally Timer cannot
        change this for you — you must set Chrome (and the installed app) to{" "}
        <span className="font-bold text-rally-text">Unrestricted</span>. After that, throws
        arrive with the app closed.
      </p>

      <AndroidNotificationFix forceShow />

      <section className="mt-6 p-4 rounded-lg border border-rally-border bg-rally-surface space-y-3 text-sm">
        <h2 className="font-bold text-rally-accent">Quick buttons</h2>
        <p className="text-rally-muted text-xs">
          These open Android settings screens when your phone allows it. If a button does nothing,
          follow the checklist above manually.
        </p>
        <button
          type="button"
          onClick={openAppNotificationSettings}
          className="w-full py-3 bg-rally-accent text-white font-bold rounded-lg"
        >
          Chrome notification settings
        </button>
        <button
          type="button"
          onClick={openChromeAppSettings}
          className="w-full py-3 bg-rally-bg border border-rally-border font-bold rounded-lg"
        >
          Chrome app info (then Battery → Unrestricted)
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
        <h2 className="font-bold text-rally-accent">Verify it worked</h2>
        <ol className="list-decimal list-inside text-rally-muted text-xs space-y-1.5">
          <li>Open Rally Timer → Enable notifications (if needed)</li>
          <li>Tap Send test notification</li>
          <li>Swipe Rally Timer away (close from recents)</li>
          <li>Ask an admin to send another test, or wait for a live ping</li>
          <li>You should get the alert without reopening the app</li>
        </ol>
      </section>

      <section className="mt-6 p-4 rounded-lg border border-rally-border bg-rally-surface text-sm space-y-2">
        <h2 className="font-bold text-rally-accent">Also check</h2>
        <ul className="list-disc list-inside text-rally-muted text-xs space-y-1.5">
          <li>Do Not Disturb / Bedtime mode is off</li>
          <li>Phone is not in Power saving / Ultra saving</li>
          <li>You installed the app from Chrome (Add to Home screen / Install app)</li>
          <li>iPhone users: use the /install guide instead — this page is for Android</li>
        </ul>
      </section>

      <p className="mt-6 text-center">
        <Link href="/install" className="text-rally-accent text-sm font-bold">
          Need to install the app first? →
        </Link>
      </p>
    </main>
  );
}
