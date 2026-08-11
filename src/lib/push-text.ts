/**
 * Apple Web Push endpoints — Safari / iOS PWAs.
 * WebKit ignores `silent` and will render whitespace title/body as a blank banner.
 */
export function isAppleWebPushEndpoint(endpoint: string | null | undefined): boolean {
  if (!endpoint) return false;
  return /web\.push\.apple\.com/i.test(endpoint);
}

export function isApplePushPlatform(
  platform: string | null | undefined,
  userAgent?: string | null
): boolean {
  if (platform && /^(ios|ipados|macos|safari)/i.test(platform)) return true;
  if (userAgent && /iPhone|iPad|Macintosh.*Safari/i.test(userAgent)) return true;
  return false;
}

/** True when this subscription should never receive silent/blank calibration pushes. */
export function shouldSkipSilentPush(sub: {
  endpoint: string;
  platform?: string | null;
  userAgent?: string | null;
}): boolean {
  return (
    isAppleWebPushEndpoint(sub.endpoint) ||
    isApplePushPlatform(sub.platform, sub.userAgent)
  );
}

/**
 * iOS/WebKit notification cards only reliably show title + body.
 * Flatten newlines; avoid whitespace-only strings that render as blank banners.
 */
export function sanitizeNotificationText(
  title: string,
  body: string
): { title: string; body: string } {
  const cleanTitle = String(title || "")
    .replace(/\s+/g, " ")
    .trim()
    // Drop a leading emoji/symbol run that some iOS builds fail to render with body.
    .replace(/^[^A-Za-z0-9▶🚨]+/, "")
    .trim();
  const cleanBody = String(body || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " · ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title: cleanTitle || "Whiteout Rally",
    body: cleanBody || "Rally notification",
  };
}

export function isBlankNotificationText(value: unknown): boolean {
  return !String(value ?? "").trim();
}
