"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useServerClock } from "@/hooks/useServerClock";
import { CallerRallyView, pickPrimaryCallerEvent } from "@/components/CallerRallyView";
import { HomeButton } from "@/components/HomeButton";
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
    return <div className="p-8 text-center text-rally-muted">Loading...</div>;
  }

  const primary = pickPrimaryCallerEvent(events, user.id, correctedNow());

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-2">
        <HomeButton />
        <div className="flex items-center gap-3">
          <Link href="/caller/settings" className="text-rally-muted text-sm hover:text-rally-accent">
            Settings
          </Link>
          <button onClick={logout} className="text-rally-muted text-sm hover:text-rally-danger">
            Logout
          </button>
        </div>
      </div>

      {primary ? (
        <CallerRallyView eventId={primary.id} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
          <p className="text-rally-muted text-sm mb-2">No rally assigned yet</p>
          <p className="text-rally-muted text-xs mb-6">
            When an admin links you to a template, your throw countdown will show here.
          </p>
          <Link href="/caller/settings" className="text-rally-accent text-sm font-bold">
            Notification settings →
          </Link>
        </div>
      )}
    </main>
  );
}
