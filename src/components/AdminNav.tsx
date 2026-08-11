"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Users, Code2, LogOut } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { HomeButton } from "@/components/HomeButton";

export function AdminNav({
  displayName,
  role,
  onLogout,
}: {
  displayName: string;
  role: string;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const isDeveloper = role === "DEVELOPER";

  const links = [
    { href: "/admin", label: "Templates", icon: LayoutGrid, match: (p: string) => p === "/admin" || p.startsWith("/admin/events") },
    { href: "/admin/users", label: "Users", icon: Users, match: (p: string) => p.startsWith("/admin/users") },
    ...(isDeveloper
      ? [
          {
            href: "/admin/developer",
            label: "Developer",
            icon: Code2,
            match: (p: string) => p.startsWith("/admin/developer") || p.startsWith("/admin/test-bench"),
          },
        ]
      : []),
  ];

  return (
    <div className="mb-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <BrandLogo size="sm" />
          <p className="text-rally-muted text-xs mt-2 truncate">
            {displayName}
            {isDeveloper ? (
              <span className="ml-2 text-rally-ice font-semibold uppercase tracking-wide">
                Developer
              </span>
            ) : (
              <span className="ml-2 text-rally-muted font-semibold uppercase tracking-wide">
                Admin
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <HomeButton />
          <button type="button" onClick={onLogout} className="btn-ghost text-xs" title="Logout">
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="hidden xs:inline">Logout</span>
          </button>
        </div>
      </div>

      <nav
        className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1"
        aria-label="Admin"
      >
        {links.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname || "");
          return (
            <Link
              key={href}
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
          );
        })}
      </nav>
    </div>
  );
}
