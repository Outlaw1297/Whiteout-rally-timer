"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  getMobileInstallKind,
  isStandalonePWA,
  type MobileInstallKind,
} from "@/lib/push-support";

const SESSION_DISMISS_KEY = "pwa-install-remind-later";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function useInstallKind(): MobileInstallKind {
  const [kind, setKind] = useState<MobileInstallKind>("none");

  useEffect(() => {
    const refresh = () => setKind(getMobileInstallKind());
    refresh();
    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener?.("change", refresh);
    window.addEventListener("visibilitychange", refresh);
    return () => {
      mq.removeEventListener?.("change", refresh);
      window.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return kind;
}

/** Safari Share icon (square with up arrow). */
function ShareIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

/** Home + plus style cue for Add to Home Screen. */
function HomeAddIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
      <path d="M19 3v6M16 6h6" />
    </svg>
  );
}

function StepCard({
  n,
  title,
  body,
  icon,
}: {
  n: number;
  title: string;
  body: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-rally-bg border border-rally-border">
      <div className="shrink-0 w-8 h-8 rounded-full bg-rally-accent text-white font-bold flex items-center justify-center text-sm">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {icon && <span className="text-rally-accent shrink-0">{icon}</span>}
          <p className="font-bold text-rally-text text-sm">{title}</p>
        </div>
        <p className="text-rally-muted text-xs mt-1 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function IosSafariInstallSteps({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-3">
      {!compact && (
        <p className="text-rally-muted text-xs leading-relaxed">
          Apple does not allow a one-tap Install button. You must use Safari’s Share menu —
          about 15 seconds once you see the buttons.
        </p>
      )}
      <StepCard
        n={1}
        title="Tap Share at the bottom of Safari"
        body="Look at the bottom bar (or top on iPad). Tap the square with the upward arrow — same icon shown here."
        icon={<ShareIcon className="w-6 h-6" />}
      />
      <StepCard
        n={2}
        title='Scroll and tap “Add to Home Screen”'
        body='Swipe the share sheet down. If you do not see it, tap “Edit Actions” or “View More Actions”, then find Add to Home Screen.'
        icon={<HomeAddIcon className="w-6 h-6" />}
      />
      <StepCard
        n={3}
        title='Tap Add, then open Rally Timer'
        body="Confirm the name, tap Add in the top-right, leave Safari, and open the new Rally Timer icon on your home screen."
      />
      <div className="p-3 rounded-lg border border-rally-accent/40 bg-rally-accent/10 text-xs text-rally-text space-y-1">
        <p className="font-bold text-rally-accent">Common snags</p>
        <ul className="list-disc list-inside text-rally-muted space-y-1">
          <li>Must be <span className="font-bold text-rally-text">Safari</span> — Chrome/Instagram/Facebook will not work</li>
          <li>iOS 16.4 or newer needed for rally push alerts</li>
          <li>“Add to Home Screen” is often below the first row of apps — keep scrolling</li>
        </ul>
      </div>
    </div>
  );
}

function IosOpenSafariSteps({
  copied,
  onCopy,
}: {
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-rally-warning text-sm font-bold">
        You are not in Safari — switch first
      </p>
      <p className="text-rally-muted text-xs leading-relaxed">
        Chrome, Instagram, and other apps on iPhone cannot install this app or receive rally
        alerts. Use the real Safari app.
      </p>
      <StepCard
        n={1}
        title="Copy this link"
        body="Tap the button below to copy the Rally Timer address."
      />
      <StepCard
        n={2}
        title="Open the Safari app"
        body="Leave this browser. Find the blue Safari compass icon on your phone and open it."
      />
      <StepCard
        n={3}
        title="Paste → go → then install"
        body="Tap the address bar, paste, go to the site, then follow Add to Home Screen (Share → scroll → Add to Home Screen)."
      />
      <button
        type="button"
        onClick={onCopy}
        className="w-full py-3.5 bg-rally-accent text-white font-bold rounded-lg text-base"
      >
        {copied ? "✓ Link copied — now open Safari" : "Copy link for Safari"}
      </button>
      {copied && (
        <p className="text-rally-success text-xs text-center font-bold animate-pulse">
          Open Safari now and paste in the address bar
        </p>
      )}
    </div>
  );
}

/**
 * Required mobile PWA install gate. Blocks easy use until the app is on the
 * home screen (iPhone Safari / Android Chrome). Desktop users see nothing.
 */
export function PwaInstallRequired() {
  const kind = useInstallKind();
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [copied, setCopied] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [remindLater, setRemindLater] = useState(false);

  useEffect(() => {
    try {
      setRemindLater(sessionStorage.getItem(SESSION_DISMISS_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setRemindLater(false);
      try {
        sessionStorage.removeItem(SESSION_DISMISS_KEY);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const copyLink = useCallback(async () => {
    const url = `${window.location.origin}/install`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {
      window.prompt("Copy this link and open it in Safari:", url);
    }
  }, []);

  const promptAndroidInstall = useCallback(async () => {
    if (!deferred) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } finally {
      setInstalling(false);
    }
  }, [deferred]);

  const dismissForSession = () => {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setRemindLater(true);
  };

  // Dedicated /install page already shows the full guide — don't stack a modal on it.
  if (pathname === "/install") return null;
  if (kind === "none" || isStandalonePWA()) return null;
  if (remindLater) {
    return (
      <button
        type="button"
        onClick={() => setRemindLater(false)}
        className="fixed bottom-4 right-4 z-50 max-w-[14rem] px-3 py-2 rounded-lg bg-rally-warning text-rally-bg text-xs font-bold shadow-lg"
      >
        Install app required — tap for steps
      </button>
    );
  }

  const isIos = kind === "ios-install" || kind === "ios-use-safari";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-title"
    >
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-rally-surface border border-rally-accent rounded-xl p-5 shadow-2xl">
        <p className="text-rally-warning text-[10px] font-bold tracking-widest mb-1">
          REQUIRED · ~15 SECONDS
        </p>
        <h2 id="pwa-install-title" className="text-xl font-bold text-rally-text mb-1">
          {isIos ? "Install on iPhone" : "Install Rally Timer"}
        </h2>
        <p className="text-rally-muted text-sm mb-4">
          {isIos
            ? "Rally throw alerts only work from the home-screen app (Safari)."
            : "Push alerts only work from the installed app on your phone."}
        </p>

        {kind === "ios-use-safari" && (
          <IosOpenSafariSteps copied={copied} onCopy={copyLink} />
        )}

        {kind === "ios-install" && (
          <div className="space-y-3">
            <p className="text-rally-accent font-bold text-sm flex items-center gap-2">
              <ShareIcon className="w-5 h-5" />
              You are in Safari — finish with Share
            </p>
            <IosSafariInstallSteps />
            {/* Visual cue pointing at Safari's bottom toolbar */}
            <div className="relative mt-2 pt-4 pb-2 text-center">
              <p className="text-rally-muted text-[10px] mb-2 uppercase tracking-wide">
                Share button is here ↓
              </p>
              <div className="mx-auto w-full max-w-[220px] rounded-2xl border border-rally-border bg-rally-bg px-4 py-2 flex items-center justify-around text-rally-muted">
                <span className="text-lg opacity-40">◁</span>
                <span className="text-lg opacity-40">▷</span>
                <span className="text-rally-accent scale-125" aria-label="Share">
                  <ShareIcon className="w-7 h-7" />
                </span>
                <span className="text-lg opacity-40">☐</span>
                <span className="text-lg opacity-40">☰</span>
              </div>
            </div>
          </div>
        )}

        {kind === "android-use-chrome" && (
          <div className="space-y-3 text-sm">
            <p className="text-rally-accent font-bold">Android — use Chrome</p>
            <ol className="list-decimal list-inside space-y-2 text-rally-text">
              <li>
                Tap <span className="font-bold">Copy link</span> below
              </li>
              <li>
                Open <span className="font-bold">Chrome</span> (not Samsung Internet / Firefox)
              </li>
              <li>Paste the link and open the site</li>
              <li>
                Menu ⋮ → <span className="font-bold">Install app</span> or{" "}
                <span className="font-bold">Add to Home screen</span>
              </li>
              <li>Open <span className="font-bold">Rally Timer</span> from your home screen</li>
            </ol>
            <button
              type="button"
              onClick={copyLink}
              className="w-full py-3 bg-rally-accent text-white font-bold rounded-lg"
            >
              {copied ? "✓ Link copied" : "Copy link for Chrome"}
            </button>
          </div>
        )}

        {kind === "android-install" && (
          <div className="space-y-3 text-sm">
            <p className="text-rally-accent font-bold">Android — Install app</p>
            {deferred ? (
              <>
                <p className="text-rally-muted text-xs">
                  One tap installs Rally Timer on your home screen.
                </p>
                <button
                  type="button"
                  onClick={promptAndroidInstall}
                  disabled={installing}
                  className="w-full py-3 bg-rally-accent text-white font-bold rounded-lg disabled:opacity-50"
                >
                  {installing ? "Opening install…" : "Install Rally Timer"}
                </button>
              </>
            ) : (
              <>
                <ol className="list-decimal list-inside space-y-2 text-rally-text">
                  <li>
                    Tap Chrome menu <span className="font-bold">⋮</span>
                  </li>
                  <li>
                    Tap <span className="font-bold">Install app</span> or{" "}
                    <span className="font-bold">Add to Home screen</span>
                  </li>
                  <li>Open <span className="font-bold">Rally Timer</span> from your home screen</li>
                </ol>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={dismissForSession}
          className="w-full mt-4 py-2 text-rally-muted text-xs hover:text-rally-text"
        >
          Remind me later this session
        </button>
      </div>
    </div>
  );
}

/** Full-page install guide (also linked for admins to send to callers). */
export function PwaInstallGuidePage() {
  const kind = useInstallKind();
  const [copied, setCopied] = useState(false);
  const installed = isStandalonePWA();

  const copyLink = useCallback(async () => {
    const url = `${window.location.origin}/install`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }, []);

  if (installed) {
    return (
      <main className="min-h-screen px-4 py-10 max-w-md mx-auto text-center">
        <p className="text-rally-success text-4xl mb-3">✓</p>
        <h1 className="text-2xl font-bold mb-2">App installed</h1>
        <p className="text-rally-muted text-sm mb-6">
          You are in the home-screen app. Log in and enable notifications next.
        </p>
        <a
          href="/login"
          className="inline-block w-full py-3 bg-rally-accent text-white font-bold rounded-lg"
        >
          Go to login
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 max-w-md mx-auto">
      <p className="text-rally-warning text-[10px] font-bold tracking-widest mb-1">
        PHONE SETUP GUIDE
      </p>
      <h1 className="text-2xl font-bold mb-2">Install Rally Timer</h1>
      <p className="text-rally-muted text-sm mb-6">
        Send this page to callers. iPhone needs Safari (no App Store install button from Apple).
      </p>

      {kind === "ios-use-safari" && (
        <div className="mb-6">
          <IosOpenSafariSteps copied={copied} onCopy={copyLink} />
        </div>
      )}

      {kind === "ios-install" && (
        <div className="mb-6 space-y-3">
          <p className="text-rally-success text-sm font-bold">✓ Safari detected — do these 3 steps</p>
          <IosSafariInstallSteps />
        </div>
      )}

      {(kind === "android-install" || kind === "android-use-chrome") && (
        <div className="mb-6 space-y-3 text-sm">
          <p className="text-rally-accent font-bold">Android setup</p>
          <p className="text-rally-muted text-xs">
            Open this page in Chrome, then Menu ⋮ → Install app / Add to Home screen.
          </p>
          <button
            type="button"
            onClick={copyLink}
            className="w-full py-3 bg-rally-accent text-white font-bold rounded-lg"
          >
            {copied ? "✓ Link copied" : "Copy install link"}
          </button>
        </div>
      )}

      {kind === "none" && (
        <div className="space-y-4 text-sm">
          <section className="p-4 rounded-lg border border-rally-border bg-rally-surface">
            <h2 className="font-bold text-rally-accent mb-2">iPhone / iPad</h2>
            <IosSafariInstallSteps compact />
          </section>
          <section className="p-4 rounded-lg border border-rally-border bg-rally-surface">
            <h2 className="font-bold text-rally-accent mb-2">Android</h2>
            <p className="text-rally-muted text-xs">
              Chrome → Menu ⋮ → Install app (or Add to Home screen) → open the icon.
            </p>
          </section>
          <button
            type="button"
            onClick={copyLink}
            className="w-full py-3 bg-rally-accent text-white font-bold rounded-lg"
          >
            {copied ? "✓ Link copied" : "Copy this setup link to send"}
          </button>
        </div>
      )}
    </main>
  );
}
