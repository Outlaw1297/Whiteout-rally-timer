"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, Home, LogIn, ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useAuth } from "@/hooks/useAuth";
import { isAdminRole } from "@/lib/roles";
import { pickPublicLiveHref } from "@/lib/public-live-view";

/**
 * Guest/public header: Home · Public live view · Login.
 * Used on the schedule, login, and per-rally live pages.
 */
export function PublicTopNav() {
  const pathname = usePathname() || "/";
  const { user, loading } = useAuth();
  const [liveHref, setLiveHref] = useState(() => pickPublicLiveHref(pathname, []));

  useEffect(() => {
    if (pathname.startsWith("/events/")) {
      setLiveHref(pickPublicLiveHref(pathname, []));
      return;
    }
    let cancelled = false;
    fetch("/api/events")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setLiveHref(pickPublicLiveHref(pathname, data.events || []));
      })
      .catch(() => {
        if (!cancelled) setLiveHref("/");
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const accountHref = user
    ? isAdminRole(user.role)
      ? "/admin"
      : "/caller"
    : "/login";

  const tabs: Array<{
    href: string;
    label: string;
    icon: typeof Home;
    active: boolean;
  }> = [
    { href: "/", label: "Home", icon: Home, active: pathname === "/" },
    {
      href: liveHref,
      label: "Public live view",
      icon: ExternalLink,
      active: pathname.startsWith("/events/"),
    },
  ];

  if (!loading && user) {
    tabs.push({
      href: accountHref,
      label: isAdminRole(user.role) ? "Admin" : "My Rallies",
      icon: ArrowRight,
      active: false,
    });
  } else {
    tabs.push({
      href: "/login",
      label: "Login",
      icon: LogIn,
      active: pathname === "/login",
    });
  }

  return (
    <div className="mb-5">
      <div className="mb-3">
        <BrandLogo size="sm" />
      </div>
      <nav className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1" aria-label="Public">
        {tabs.map(({ href, label, icon: Icon, active }) => (
          <Link
            key={label}
            href={href}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm min-h-[40px] whitespace-nowrap border ${
              active
                ? "border-rally-ice/40 bg-rally-ice/10 text-rally-ice font-semibold"
                : "border-transparent text-rally-muted hover:text-rally-snow hover:bg-rally-surface"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
