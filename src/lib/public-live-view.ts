/**
 * Resolve the public live-view URL for the current page.
 * Event admin/public routes map to `/events/:id`. Otherwise prefer an ACTIVE rally.
 */
export function eventIdFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/(?:admin\/)?events\/([^/?#]+)/);
  return match?.[1] ?? null;
}

export function pickPublicLiveHref(
  pathname: string | null | undefined,
  events: Array<{ id: string; status: string }>
): string {
  const fromPath = eventIdFromPath(pathname);
  if (fromPath) return `/events/${fromPath}`;
  const live = events.find((e) => e.status === "ACTIVE");
  if (live) return `/events/${live.id}`;
  return "/";
}
