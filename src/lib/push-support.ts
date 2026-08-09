/**
 * Web Push capability checks with iOS / PWA-specific handling.
 *
 * iOS 16.4+ only exposes push for home-screen PWAs opened in Safari.
 * PushManager is often missing from window but available on registration.pushManager.
 */

export type PushEnvironment =
  | "ready"
  | "unsupported"
  | "ios-use-safari"
  | "ios-install";

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isIOSChrome(): boolean {
  return isIOSDevice() && /CriOS/i.test(navigator.userAgent);
}

export function isIOSSafari(): boolean {
  if (!isIOSDevice()) return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
}

export function isIOSInAppBrowser(): boolean {
  const ua = navigator.userAgent;
  return /FBAN|FBAV|Instagram|Line\/|Twitter|GSA\/|Snapchat|LinkedInApp/i.test(ua);
}

export function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

export function hasNotificationApi(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function hasServiceWorkerApi(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/** PushManager is not always on window (notably iOS home-screen PWAs). */
export async function hasPushApi(): Promise<boolean> {
  if (typeof window !== "undefined" && "PushManager" in window) return true;
  if (!hasServiceWorkerApi()) return false;

  try {
    let registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) {
      registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
    await navigator.serviceWorker.ready;
    return typeof registration.pushManager?.getSubscription === "function";
  } catch {
    return false;
  }
}

export async function assessPushEnvironment(): Promise<PushEnvironment> {
  if (!hasServiceWorkerApi() || !hasNotificationApi()) {
    return "unsupported";
  }

  if (isIOSDevice()) {
    if (isIOSInAppBrowser() || isIOSChrome() || (!isIOSSafari() && !isStandalonePWA())) {
      return "ios-use-safari";
    }
    if (!isStandalonePWA()) {
      return "ios-install";
    }
  }

  const pushOk = await hasPushApi();
  if (!pushOk) {
    return isIOSDevice() ? "ios-install" : "unsupported";
  }

  return "ready";
}

export function detectPlatform(): string {
  const ua = navigator.userAgent;
  if (isIOSDevice()) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  return "Desktop";
}
