"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useServerClock } from "@/hooks/useServerClock";
import { CallerRallyView, pickPrimaryCallerEvent } from "@/components/CallerRallyView";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AppShell, AppHeader } from "@/components/ui/AppShell";
import type { SerializedEvent } from "@/hooks/useEventSocket";

export default function CallerHomePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<SerializedEvent[] | null>(null);
  const { correctedNow } = useServerClock({ activeRally: true });

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && (user.role === "ADMIN" || user.role === "DEVELOPER")) router.push("/admin");
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role !== "CALLER") return;
    let cancelled = false;
    const load = () => {
      fetch("/api/events")
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) setEvents(data.events || []);
        })
        .catch(() => {
          if (!cancelled) setEvents([]);
        });
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user]);

  if (loading || !user || events === null) {
    return <div className="p-8 text-center text-rally-muted">Loading…</div>;
  }

  const primary = pickPrimaryCallerEvent(events, user.id, correctedNow());

  return (
    <AppShell className="flex flex-col page-enter">
      <AppHeader
        left={<BrandLogo size="sm" />}
        right={
          <>
            <Link href="/caller/settings" className="btn-ghost text-xs gap-1">
              <Settings className="h-4 w-4" aria-hidden />
              Settings
            </Link>
            <button type="button" onClick={logout} className="btn-ghost text-xs gap-1">
              <LogOut className="h-4 w-4" aria-hidden />
              Logout
            </button>
          </>
        }
      />

      {primary ? (
        <CallerRallyView eventId={primary.id} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
          <p className="text-rally-snow font-semibold mb-2">No rally assigned yet</p>
          <p className="text-rally-muted text-sm mb-6 max-w-xs leading-relaxed">
            When an admin links you to a template, your throw countdown will show here.
          </p>
          <Link href="/caller/settings" className="btn-secondary text-sm">
            Notification settings
          </Link>
        </div>
      )}
    </AppShell>
  );
}
