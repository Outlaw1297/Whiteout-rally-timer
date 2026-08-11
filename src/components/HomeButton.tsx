"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Home } from "lucide-react";
import { homePathForRole } from "@/lib/roles";

/**
 * Role-aware home:
 * - Callers → /caller (personal rally countdown)
 * - Admins / Developers → /admin
 * - Guests → / (public schedule)
 */
export function HomeButton({ className = "" }: { className?: string }) {
  const [href, setHref] = useState("/");
  const [label, setLabel] = useState("Live rallies");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { user?: { role?: string } | null };
        if (cancelled) return;
        if (data.user?.role === "CALLER") {
          setHref("/caller");
          setLabel("Home");
        } else if (data.user?.role === "ADMIN" || data.user?.role === "DEVELOPER") {
          setHref(homePathForRole(data.user.role));
          setLabel("Home");
        } else {
          setHref("/");
          setLabel("Live rallies");
        }
      } catch {
        /* keep public home */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      href={href}
      className={`nav-link gap-1.5 font-semibold text-rally-ice ${className}`}
      title="Home"
    >
      <Home className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  );
}
