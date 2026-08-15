/**
 * Device / browser labeling for push subscriptions.
 * Prefer parsing the real userAgent on the server — clients can lie or stale-cache.
 *
 * IMPORTANT: Android UAs contain "Linux" (`Linux; Android 14`). Always check
 * Android/iOS before desktop Linux or labels become "Linux · …".
 */

export function detectPlatformFromUA(ua: string | null | undefined): string {
  if (!ua || !ua.trim()) return "Unknown";

  const isAndroid = /Android/i.test(ua);
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    // iPadOS desktop-mode Safari
    (/Macintosh/i.test(ua) && /Mobile\//i.test(ua));
  const isChromeOS = /CrOS/i.test(ua);
  const isWindows = /Windows/i.test(ua);
  const isMac = /Mac OS X|Macintosh/i.test(ua) && !isIOS;
  // Only call it Linux when it's not Android/ChromeOS.
  const isLinux = /Linux/i.test(ua) && !isAndroid && !isChromeOS;

  const isEdge = /EdgA?\//i.test(ua) || /EdgiOS\//i.test(ua);
  const isOpera = /OPR\/|Opera/i.test(ua);
  const isSamsung = /SamsungBrowser/i.test(ua);
  const isFirefox = /Firefox\/|FxiOS\//i.test(ua);
  const isChrome =
    (/Chrome\//i.test(ua) || /CriOS\//i.test(ua)) &&
    !isEdge &&
    !isOpera &&
    !isSamsung;
  const isSafari =
    /Safari\//i.test(ua) && !isChrome && !isEdge && !isFirefox && !isOpera && !isSamsung;

  let os = "Desktop";
  if (isAndroid) os = "Android";
  else if (isIOS) os = "iOS";
  else if (isChromeOS) os = "ChromeOS";
  else if (isWindows) os = "Windows";
  else if (isMac) os = "macOS";
  else if (isLinux) os = "Linux";

  let browser = "Browser";
  if (isSamsung) browser = "Samsung Internet";
  else if (isEdge) browser = "Edge";
  else if (isOpera) browser = "Opera";
  else if (isFirefox) browser = "Firefox";
  else if (isChrome) browser = "Chrome";
  else if (isSafari) browser = "Safari";

  return `${os} · ${browser}`;
}

/**
 * Apple Web Push (iOS/iPadOS home-screen PWAs) requires a user-visible
 * notification for every push. Silent/calibration pings that show then close
 * (or skip showNotification while the PWA is open) exhaust a per-app budget;
 * Apple then accepts later pushes (test still "succeeds" on the server) but
 * never wakes the service worker again until the user reopens the app.
 */
export function allowsSilentWebPush(
  platform?: string | null,
  userAgent?: string | null
): boolean {
  const label = resolveDevicePlatform(platform, userAgent);
  return platformFamily(label) !== "iOS";
}

/** Coarse bucket used by summary counters and delivery-lead defaults. */
export function platformFamily(label: string | null | undefined): "Android" | "iOS" | "Desktop" | "Unknown" {
  if (!label) return "Unknown";
  if (/^Android/i.test(label) || /android/i.test(label)) return "Android";
  if (/^iOS/i.test(label) || /\biOS\b/i.test(label)) return "iOS";
  if (/Unknown/i.test(label)) return "Unknown";
  return "Desktop";
}

/**
 * Best label for admin UI: prefer live UA parse, fall back to stored platform.
 */
export function resolveDevicePlatform(
  platform: string | null | undefined,
  userAgent: string | null | undefined
): string {
  if (userAgent && userAgent.trim()) {
    return detectPlatformFromUA(userAgent);
  }
  if (platform && platform.trim()) return platform;
  return "Unknown";
}
