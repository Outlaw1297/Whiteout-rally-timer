"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { shouldOfferDeviceOnboarding } from "@/lib/device-onboarding";
import { homePathForRole } from "@/lib/roles";

const SKIP_PATHS = new Set([
  "/onboarding",
  "/login",
  "/install",
  "/fix-notifications",
  "/live",
]);

/**
 * After login on a new browser/device, send the user through setup once.
 * Skips public pages and the onboarding route itself.
 */
export function DeviceOnboardingGate() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    if (!pathname || SKIP_PATHS.has(pathname)) return;
    if (pathname.startsWith("/api")) return;
    if (!shouldOfferDeviceOnboarding(user.id)) return;

    const next = encodeURIComponent(pathname || homePathForRole(user.role));
    router.replace(`/onboarding?next=${next}`);
  }, [loading, user, pathname, router]);

  return null;
}
