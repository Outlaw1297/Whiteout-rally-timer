/** Dedicated public live-view route — all ACTIVE rallies, no login. */
export const PUBLIC_LIVE_HREF = "/live";

export function isPublicLiveNavActive(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === PUBLIC_LIVE_HREF || pathname.startsWith("/events/");
}

/** @deprecated Use PUBLIC_LIVE_HREF. Kept so older callers keep compiling. */
export function pickPublicLiveHref(
  _pathname?: string | null,
  _events?: Array<{ id: string; status: string }>
): string {
  return PUBLIC_LIVE_HREF;
}

export function eventIdFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/(?:admin\/)?events\/([^/?#]+)/);
  return match?.[1] ?? null;
}
