"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Home,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { homePathForRole } from "@/lib/roles";
import { markDeviceOnboardingComplete } from "@/lib/device-onboarding";
import {
  detectOem,
  openAppNotificationSettings,
  openChromeAppSettings,
  ackAndroidHeadsUp,
  ackAndroidPushFix,
} from "@/components/AndroidNotificationFix";
import { PushNotificationsProvider, usePushNotificationsContext } from "@/components/PushNotificationsProvider";
import {
  getMobileInstallKind,
  isAndroidDevice,
  isIOSDevice,
  isMobileDevice,
  isStandalonePWA,
  type MobileInstallKind,
} from "@/lib/push-support";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AppShell } from "@/components/ui/AppShell";

type StepId =
  | "welcome"
  | "install"
  | "notifications"
  | "previews"
  | "heads-up"
  | "battery"
  | "test"
  | "tips"
  | "done";

function Shot({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  return (
    <figure className="space-y-2">
      <div className="relative mx-auto w-full max-w-[260px] overflow-hidden rounded-2xl border border-rally-border bg-rally-bg shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
        <Image
          src={src}
          alt={alt}
          width={720}
          height={1280}
          className="h-auto w-full"
          priority
        />
      </div>
      {caption ? (
        <figcaption className="text-center text-[11px] text-rally-muted leading-relaxed px-2">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-rally-ice/30 bg-rally-ice/10 px-3 py-2.5 text-xs text-rally-snow leading-relaxed">
      <span className="font-semibold text-rally-ice">Tip: </span>
      {children}
    </div>
  );
}

function Progress({ step, total }: { step: number; total: number }) {
  const pct = Math.round(((step + 1) / total) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-rally-muted">
        <span>
          Step {step + 1} of {total}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-rally-border overflow-hidden">
        <div
          className="h-full rounded-full bg-rally-ice transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function InstallStepBody({ kind }: { kind: MobileInstallKind }) {
  if (kind === "ios-use-safari") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-rally-muted leading-relaxed">
          On iPhone, open this site in <span className="font-semibold text-rally-snow">Safari</span>{" "}
          (not Chrome or an in-app browser), then add it to your Home Screen.
        </p>
        <Tip>
          Copy the link, open Safari, paste it in the address bar, then continue this setup.
        </Tip>
        <Link href="/install" className="btn-secondary w-full text-center block">
          Open full install guide
        </Link>
      </div>
    );
  }

  if (kind === "ios-install" || isIOSDevice()) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-rally-muted leading-relaxed">
          iPhone needs the Home Screen app for throw alerts to work when Whiteout is open.
        </p>
        <Shot
          src="/onboarding/ios-add-home.jpg"
          alt="Safari Share then Add to Home Screen"
          caption="Safari → Share (square with arrow) → Add to Home Screen"
        />
        <ol className="list-decimal list-inside space-y-2 text-sm text-rally-snow">
          <li>Tap the Share button at the bottom of Safari</li>
          <li>Scroll and tap Add to Home Screen</li>
          <li>Tap Add, then open Rally Timer from your home screen</li>
        </ol>
        <Tip>Push alerts do not work from a normal Safari tab — only from the installed icon.</Tip>
      </div>
    );
  }

  if (kind === "android-use-chrome") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-rally-muted leading-relaxed">
          Use <span className="font-semibold text-rally-snow">Chrome</span> (not Samsung Internet
          or Firefox) so background rally alerts can reach this phone.
        </p>
        <Link href="/install" className="btn-secondary w-full text-center block">
          Open install guide
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-rally-muted leading-relaxed">
        Install Rally Timer so alerts keep working when you switch to Whiteout Survival.
      </p>
      <Shot
        src="/onboarding/android-install.jpg"
        alt="Chrome menu Install app"
        caption="Chrome → ⋮ menu → Install app"
      />
      <ol className="list-decimal list-inside space-y-2 text-sm text-rally-snow">
        <li>Tap the ⋮ menu in Chrome</li>
        <li>Tap Install app / Add to Home screen</li>
        <li>Open Rally Timer from your home screen or app drawer</li>
      </ol>
      <Tip>After installing, come back here and continue — your login stays signed in.</Tip>
    </div>
  );
}

function HeadsUpStepBody({ oem }: { oem: ReturnType<typeof detectOem> }) {
  if (oem === "samsung") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-rally-muted leading-relaxed">
          On Galaxy / Fold, alerts often land only in the quick panel until you set{" "}
          <span className="font-semibold text-rally-snow">Sound and pop-up</span>.
        </p>
        <Shot
          src="/onboarding/samsung-popup.jpg"
          alt="Samsung Sound and pop-up setting"
          caption="Notification category → Sound and pop-up + Show as pop-up"
        />
        <ol className="list-decimal list-inside space-y-2 text-sm text-rally-snow">
          <li>Send a test later, then long-press the alert in the shade → Settings</li>
          <li>Choose Sound and pop-up (not Sound, not Silent)</li>
          <li>
            Settings → Notifications → Advanced → enable Manage notification categories for each
            app if you do not see categories
          </li>
          <li>Categories → General → Show as pop-up ON</li>
        </ol>
        <button type="button" onClick={openAppNotificationSettings} className="btn-secondary w-full">
          Open Chrome notification settings
        </button>
      </div>
    );
  }

  if (oem === "pixel") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-rally-muted leading-relaxed">
          Pixel needs <span className="font-semibold text-rally-snow">Alerting</span> plus{" "}
          <span className="font-semibold text-rally-snow">Pop on screen</span> or you only get a
          status-bar icon.
        </p>
        <Shot
          src="/onboarding/pixel-popup.jpg"
          alt="Pixel Alerting and Pop on screen"
          caption="Category → Alerting → Pop on screen ON"
        />
        <ol className="list-decimal list-inside space-y-2 text-sm text-rally-snow">
          <li>Long-press a Rally alert → gear / Settings</li>
          <li>Tap Alerting (not Silent)</li>
          <li>Open the category → turn Pop on screen ON</li>
        </ol>
        <button type="button" onClick={openAppNotificationSettings} className="btn-secondary w-full">
          Open Chrome notification settings
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-rally-muted leading-relaxed">
        Android will keep alerts in the shade unless the category allows banners / pop-up.
      </p>
      <Shot
        src="/onboarding/pixel-popup.jpg"
        alt="Enable pop on screen for notifications"
        caption="Set importance to Alerting / High and enable Pop on screen"
      />
      <ol className="list-decimal list-inside space-y-2 text-sm text-rally-snow">
        <li>Long-press a Rally notification → Settings</li>
        <li>Set to Alerting / High / Sound and pop-up</li>
        <li>Turn on Pop on screen / Floating / Banner if listed</li>
      </ol>
      <button type="button" onClick={openAppNotificationSettings} className="btn-secondary w-full">
        Open Chrome notification settings
      </button>
    </div>
  );
}

function NotificationsStepInner({ onEnabled }: { onEnabled: () => void }) {
  const { enableNotifications, isSubscribed, loading, lastError } = usePushNotificationsContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isSubscribed) onEnabled();
  }, [isSubscribed, onEnabled]);

  const handleEnable = async () => {
    setBusy(true);
    setError(null);
    const result = await enableNotifications();
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Could not enable notifications.");
      return;
    }
    onEnabled();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-rally-muted leading-relaxed">
        Allow notifications so Rally Timer can wake this phone at throw time — even when Whiteout
        is in front.
      </p>
      <Shot
        src="/onboarding/allow-notifications.jpg"
        alt="Allow notifications permission dialog"
        caption="When the system asks, tap Allow"
      />
      {isSubscribed ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-rally-success">
          <Check className="h-4 w-4" aria-hidden />
          Notifications enabled on this device
        </p>
      ) : (
        <button
          type="button"
          onClick={handleEnable}
          disabled={busy || loading}
          className="btn-primary w-full inline-flex items-center justify-center gap-2"
        >
          <Bell className="h-4 w-4" aria-hidden />
          {busy ? "Enabling…" : "Enable notifications"}
        </button>
      )}
      {(error || lastError) && (
        <p className="text-rally-danger text-xs text-center" role="alert">
          {error || lastError}
        </p>
      )}
      <Tip>
        If you accidentally tapped Block, open Chrome site settings for this page and reset
        Notifications to Allow.
      </Tip>
    </div>
  );
}

function TestStepInner({ onTested }: { onTested: () => void }) {
  const { sendTestNotification, isSubscribed } = usePushNotificationsContext();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    setBusy(true);
    setError(null);
    const res = await sendTestNotification();
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Test failed — enable notifications first.");
      return;
    }
    setSent(true);
    onTested();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-rally-muted leading-relaxed">
        Put Whiteout (or the home screen) in front, then send a test. You want a brief banner —
        not only an icon in the shade.
      </p>
      <Shot
        src="/onboarding/heads-up-banner.jpg"
        alt="Heads-up banner over the game"
        caption="Success looks like a banner popping over your game"
      />
      <button
        type="button"
        onClick={handleTest}
        disabled={busy || !isSubscribed}
        className="btn-primary w-full"
      >
        {busy ? "Sending…" : sent ? "Send another test" : "Send test notification"}
      </button>
      {!isSubscribed && (
        <p className="text-rally-warning text-xs text-center">
          Enable notifications on the previous step first.
        </p>
      )}
      {sent && (
        <p className="text-rally-success text-xs text-center font-semibold">
          Test sent — check for a banner on screen.
        </p>
      )}
      {error && (
        <p className="text-rally-danger text-xs text-center" role="alert">
          {error}
        </p>
      )}
      <Tip>
        Shade only? Go back one step and fix Sound and pop-up / Pop on screen, then test again.
      </Tip>
    </div>
  );
}

function WizardBody() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const oem = useMemo(() => detectOem(), []);
  const [installKind, setInstallKind] = useState<MobileInstallKind>("none");
  const [standalone, setStandalone] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [android, setAndroid] = useState(false);
  const [ios, setIos] = useState(false);
  const [notifsEnabled, setNotifsEnabled] = useState(false);
  const [tested, setTested] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    setInstallKind(getMobileInstallKind());
    setStandalone(isStandalonePWA());
    setMobile(isMobileDevice());
    setAndroid(isAndroidDevice());
    setIos(isIOSDevice());
  }, []);

  const steps = useMemo(() => {
    const list: { id: StepId; title: string; subtitle: string }[] = [
      {
        id: "welcome",
        title: "Set up this device",
        subtitle: "Two minutes now saves missed throws in-game.",
      },
    ];

    if (mobile && !standalone && installKind !== "none") {
      list.push({
        id: "install",
        title: "Install Rally Timer",
        subtitle: "Home-screen app = reliable alerts.",
      });
    }

    list.push({
      id: "notifications",
      title: "Allow notifications",
      subtitle: "Required for throw alerts on this phone.",
    });

    if (ios) {
      list.push({
        id: "previews",
        title: "Show Previews → Always",
        subtitle: "Otherwise lock-screen alerts hide the throw text.",
      });
    }

    if (android) {
      list.push({
        id: "heads-up",
        title: "Turn on pop-up banners",
        subtitle: "Otherwise alerts only sit in the quick panel.",
      });
      list.push({
        id: "battery",
        title: "Battery → Unrestricted",
        subtitle: "Stops Android from pausing Chrome in the background.",
      });
    }

    list.push({
      id: "test",
      title: "Send a test",
      subtitle: "Confirm a banner appears over your game.",
    });
    list.push({
      id: "tips",
      title: "Tips & tricks",
      subtitle: "Quick habits that keep rallies on time.",
    });
    list.push({
      id: "done",
      title: "You're ready",
      subtitle: "This device is set up for rally alerts.",
    });

    return list;
  }, [mobile, standalone, installKind, android, ios]);

  const step = steps[Math.min(stepIndex, steps.length - 1)];

  const finish = useCallback(() => {
    if (!user) return;
    markDeviceOnboardingComplete(user.id);
    if (android) {
      ackAndroidHeadsUp();
      ackAndroidPushFix();
    }
    const next = searchParams.get("next");
    const fallback = homePathForRole(user.role);
    router.replace(next && next.startsWith("/") ? next : fallback);
  }, [user, android, router, searchParams]);

  const goNext = () => {
    if (stepIndex >= steps.length - 1) {
      finish();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));

  if (loading) {
    return (
      <AppShell className="flex items-center justify-center">
        <p className="text-rally-muted text-sm">Loading…</p>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell className="flex flex-col items-center justify-center gap-4">
        <p className="text-rally-muted text-sm">Log in to set up this device.</p>
        <Link href="/login" className="btn-primary">
          Log in
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell className="page-enter !max-w-md flex flex-col gap-4 pb-8">
      <header className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2 min-w-0">
          <BrandLogo size="sm" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rally-muted">
              Device setup
            </p>
            <p className="text-sm font-semibold text-rally-snow truncate">Hi, {user.displayName}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={finish}
          className="text-xs text-rally-muted hover:text-rally-ice shrink-0"
        >
          Skip for now
        </button>
      </header>

      <Progress step={stepIndex} total={steps.length} />

      <section className="rounded-xl border border-rally-border bg-rally-surface p-4 space-y-4 flex-1">
        <div>
          <h1 className="text-xl font-bold text-rally-snow leading-tight">{step.title}</h1>
          <p className="text-sm text-rally-muted mt-1 leading-relaxed">{step.subtitle}</p>
        </div>

        {step.id === "welcome" && (
          <div className="space-y-4">
            <div className="grid gap-2">
              {[
                {
                  icon: <Smartphone className="h-4 w-4 text-rally-ice" />,
                  title: "Install the app",
                  body: "Home screen icon keeps push alive in the background.",
                },
                {
                  icon: <Bell className="h-4 w-4 text-rally-ice" />,
                  title: "Allow alerts",
                  body: "Throw / countdown banners when you are in Whiteout.",
                },
                {
                  icon: <Zap className="h-4 w-4 text-rally-ice" />,
                  title: "OEM pop-up + battery",
                  body: "Samsung / Pixel need one settings pass or banners stay in the shade.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex gap-3 rounded-lg border border-rally-border bg-rally-bg p-3"
                >
                  <div className="mt-0.5 shrink-0">{item.icon}</div>
                  <div>
                    <p className="text-sm font-semibold text-rally-snow">{item.title}</p>
                    <p className="text-xs text-rally-muted mt-0.5 leading-relaxed">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <Tip>
              Do this once per phone. You can replay setup anytime from Settings → Device setup
              guide.
            </Tip>
          </div>
        )}

        {step.id === "install" && <InstallStepBody kind={installKind} />}

        {step.id === "notifications" && (
          <PushNotificationsProvider>
            <NotificationsStepInner onEnabled={() => setNotifsEnabled(true)} />
          </PushNotificationsProvider>
        )}

        {step.id === "previews" && (
          <div className="space-y-4">
            <p className="text-sm text-rally-muted leading-relaxed">
              If lock-screen alerts only say “from Whiteout Rally” with no throw text, iPhone is
              hiding notification content. Set Show Previews to{" "}
              <span className="font-semibold text-rally-snow">Always</span>.
            </p>
            <Shot
              src="/onboarding/ios-show-previews.jpg"
              alt="iOS Settings Show Previews set to Always"
              caption="Settings → Notifications → Show Previews → Always"
            />
            <ol className="list-decimal list-inside space-y-2 text-sm text-rally-snow">
              <li>Open Settings → Notifications</li>
              <li>Tap Show Previews near the top</li>
              <li>
                Choose <span className="font-semibold text-rally-ice">Always</span> (not When
                Unlocked)
              </li>
            </ol>
            <Tip>
              “When Unlocked” is the iPhone default — it hides the body until you unlock, which
              looks like a blank rally alert.
            </Tip>
          </div>
        )}

        {step.id === "heads-up" && <HeadsUpStepBody oem={oem} />}

        {step.id === "battery" && (
          <div className="space-y-4">
            <p className="text-sm text-rally-muted leading-relaxed">
              If alerts only appear after you reopen Rally Timer, Android paused Chrome. Set battery
              to Unrestricted.
            </p>
            <Shot
              src="/onboarding/battery-unrestricted.jpg"
              alt="App battery usage Unrestricted"
              caption="Chrome (and Rally Timer) → Battery → Unrestricted"
            />
            <ol className="list-decimal list-inside space-y-2 text-sm text-rally-snow">
              <li>Settings → Apps → Chrome → Battery → Unrestricted</li>
              <li>If Rally Timer is installed: same for Rally Timer</li>
              <li>Turn off Power saving / Battery saver while coordinating</li>
            </ol>
            <button type="button" onClick={openChromeAppSettings} className="btn-secondary w-full">
              Open Chrome app info
            </button>
            <Tip>
              Fold users: confirm this on the screen you play on. Cover and open displays share the
              same app settings.
            </Tip>
          </div>
        )}

        {step.id === "test" && (
          <PushNotificationsProvider>
            <TestStepInner onTested={() => setTested(true)} />
          </PushNotificationsProvider>
        )}

        {step.id === "tips" && (
          <div className="space-y-3">
            {(ios
              ? [
                  "iPhone: Settings → Notifications → Show Previews → Always (or lock-screen alerts hide the throw text).",
                  "Keep Rally Timer installed from Safari — don't rely on a normal browser tab.",
                  "Before a war: open Rally Timer once, confirm notifications show Enabled.",
                  "Admins: link each caller slot to an account that enabled alerts on their phone.",
                  "High delivery lead is learned automatically after a few alerts — leave it alone.",
                ]
              : [
                  "Keep Rally Timer installed — don't rely on a random Chrome tab.",
                  "Before a war: open Rally Timer once, confirm notifications show Enabled.",
                  "If banners stop: open /fix-notifications for your phone's pop-up steps.",
                  "Admins: link each caller slot to an account that enabled alerts on their phone.",
                  "High delivery lead is learned automatically after a few alerts — leave it alone.",
                ]
            ).map((tip) => (
              <div
                key={tip}
                className="flex gap-2.5 rounded-lg border border-rally-border bg-rally-bg px-3 py-2.5"
              >
                <Sparkles className="h-4 w-4 text-rally-warning shrink-0 mt-0.5" aria-hidden />
                <p className="text-xs text-rally-snow leading-relaxed">{tip}</p>
              </div>
            ))}
            <Link href="/fix-notifications" className="btn-secondary w-full text-center block">
              Full Android fix page
            </Link>
          </div>
        )}

        {step.id === "done" && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rally-success/15 border border-rally-success/40">
              <Check className="h-7 w-7 text-rally-success" aria-hidden />
            </div>
            <p className="text-sm text-rally-muted leading-relaxed">
              {notifsEnabled || tested
                ? "This browser is marked set up. You can replay the guide from settings anytime."
                : "You can finish enabling alerts from Caller settings whenever you are ready."}
            </p>
            <div className="rounded-lg border border-rally-border bg-rally-bg p-3 text-left space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rally-muted">
                Checklist
              </p>
              <ul className="space-y-1 text-xs text-rally-snow">
                <li className="flex gap-2">
                  <Check className="h-3.5 w-3.5 text-rally-success shrink-0 mt-0.5" />
                  Installed / using the right browser
                </li>
                <li className="flex gap-2">
                  <Check className="h-3.5 w-3.5 text-rally-success shrink-0 mt-0.5" />
                  Notifications allowed
                </li>
                {android && (
                  <>
                    <li className="flex gap-2">
                      <Check className="h-3.5 w-3.5 text-rally-success shrink-0 mt-0.5" />
                      Pop-up / Sound and pop-up reviewed
                    </li>
                    <li className="flex gap-2">
                      <Check className="h-3.5 w-3.5 text-rally-success shrink-0 mt-0.5" />
                      Battery Unrestricted reviewed
                    </li>
                  </>
                )}
              </ul>
            </div>
          </div>
        )}
      </section>

      <div className="flex gap-2 sticky bottom-0 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-rally-bg via-rally-bg to-transparent">
        <button
          type="button"
          onClick={goBack}
          disabled={stepIndex === 0}
          className="btn-ghost flex-1 inline-flex items-center justify-center gap-1 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Back
        </button>
        <button
          type="button"
          onClick={goNext}
          className="btn-primary flex-[1.4] inline-flex items-center justify-center gap-1"
        >
          {step.id === "done" ? (
            <>
              <Home className="h-4 w-4" aria-hidden />
              Go to home
            </>
          ) : (
            <>
              Continue
              <ChevronRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      </div>
    </AppShell>
  );
}

export function DeviceOnboardingWizard() {
  return <WizardBody />;
}
