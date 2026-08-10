"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  getMobileInstallKind,
  isStandalonePWA,
  type MobileInstallKind,
} from "@/lib/push-support";
import {
  removePwaInstallBootGate,
  takeDeferredInstallPrompt,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa-install-boot";

const SESSION_DISMISS_KEY = "pwa-install-remind-later";

function useInstallKind(): MobileInstallKind {
  const [kind, setKind] = useState<MobileInstallKind>(() =>
    typeof window === "undefined" ? "none" : getMobileInstallKind()
  );

  useLayoutEffect(() => {
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

/**
 * Required mobile PWA install gate. Blocks easy use until the app is on the
 * home screen (iPhone Safari / Android Chrome). Desktop users see nothing.
 */
export function PwaInstallRequired() {
  const kind = useInstallKind();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(() =>
    takeDeferredInstallPrompt()
  );
  const [copied, setCopied] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [remindLater, setRemindLater] = useState(false);

  useLayoutEffect(() => {
    // React owns the gate now (modal, remind chip, or nothing for desktop).
    removePwaInstallBootGate();
  }, [kind]);

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
      const ev = e as BeforeInstallPromptEvent;
      window.__PWA_DEFERRED_INSTALL = ev;
      setDeferred(ev);
    };
    const onInstalled = () => {
      window.__PWA_DEFERRED_INSTALL = null;
      setDeferred(null);
      setRemindLater(false);
      try {
        sessionStorage.removeItem(SESSION_DISMISS_KEY);
      } catch {
        /* ignore */
      }
    };
    const existing = takeDeferredInstallPrompt();
    if (existing) setDeferred(existing);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const copyLink = useCallback(async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link and open it in the required browser:", url);
    }
  }, []);

  const shareLink = useCallback(async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Whiteout Rally Timer",
          text: "Install Rally Timer for throw alerts",
          url,
        });
        return;
      } catch {
        /* user cancelled or share failed — fall through */
      }
    }
    await copyLink();
  }, [copyLink]);

  const promptAndroidInstall = useCallback(async () => {
    if (!deferred) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
      window.__PWA_DEFERRED_INSTALL = null;
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-title"
    >
      <div className="w-full max-w-md bg-rally-surface border border-rally-accent rounded-xl p-5 shadow-2xl">
        <p className="text-rally-warning text-[10px] font-bold tracking-widest mb-1">
          REQUIRED
        </p>
        <h2 id="pwa-install-title" className="text-xl font-bold text-rally-text mb-2">
          Install Rally Timer
        </h2>
        <p className="text-rally-muted text-sm mb-4">
          Push alerts only work from the installed app on your phone. This takes under a minute.
        </p>

        {kind === "ios-use-safari" && (
          <div className="space-y-3 text-sm">
            <p className="text-rally-accent font-bold">iPhone / iPad — use Safari</p>
            <ol className="list-decimal list-inside space-y-2 text-rally-text">
              <li>
                Tap <span className="font-bold">Copy link</span> below
              </li>
              <li>
                Open <span className="font-bold">Safari</span> (not Chrome or Instagram)
              </li>
              <li>Paste the link and open the site</li>
              <li>
                Tap Share → <span className="font-bold">Add to Home Screen</span>
              </li>
              <li>Open <span className="font-bold">Rally Timer</span> from your home screen</li>
            </ol>
            <button
              type="button"
              onClick={copyLink}
              className="w-full py-3 bg-rally-accent text-white font-bold rounded-lg"
            >
              {copied ? "✓ Link copied" : "Copy link for Safari"}
            </button>
          </div>
        )}

        {kind === "ios-install" && (
          <div className="space-y-3 text-sm">
            <p className="text-rally-accent font-bold">iPhone / iPad — Add to Home Screen</p>
            <ol className="list-decimal list-inside space-y-2 text-rally-text">
              <li>
                Tap the <span className="font-bold">Share</span> button (square with ↑)
              </li>
              <li>
                Scroll and tap <span className="font-bold">Add to Home Screen</span>
              </li>
              <li>
                Tap <span className="font-bold">Add</span>, then open the new icon
              </li>
            </ol>
            <button
              type="button"
              onClick={shareLink}
              className="w-full py-3 bg-rally-accent text-white font-bold rounded-lg"
            >
              Open Share menu
            </button>
            <p className="text-rally-muted text-xs text-center">
              If Share does not open, use the Safari toolbar Share button manually.
            </p>
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
                <button
                  type="button"
                  onClick={shareLink}
                  className="w-full py-3 bg-rally-accent text-white font-bold rounded-lg"
                >
                  Share / copy link
                </button>
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
