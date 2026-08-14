"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PublicTopNav } from "@/components/PublicTopNav";
import { PublicRallyLiveView } from "@/components/PublicRallyLiveView";
import { AppShell } from "@/components/ui/AppShell";
import type { SerializedEvent } from "@/hooks/useEventSocket";

export default function PublicLivePage() {
  const [events, setEvents] = useState<SerializedEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const urls = ["/api/live-rallies", "/api/events/live", "/api/events"];
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const data = await res.json();
          if (!Array.isArray(data.events)) continue;
          if (cancelled) return;
          setEvents(
            data.events.filter(
              (e: SerializedEvent) => String(e.status).toUpperCase() === "ACTIVE"
            )
          );
          return;
        } catch {
          /* try next */
        }
      }
      if (!cancelled) setEvents([]);
    };
    load();
    const interval = setInterval(load, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const live = (events || []).filter((e) => e.status === "ACTIVE");
  const multi = live.length > 1;

  return (
    <AppShell className="page-enter" wide>
      <div className="max-w-lg mx-auto w-full md:max-w-none">
        <PublicTopNav />

        {events === null ? (
          <p className="text-rally-muted text-center py-12">Loading live rallies…</p>
        ) : live.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-rally-snow font-semibold mb-2">No rallies are live</p>
            <p className="text-rally-muted text-sm mb-6">
              When an admin presses GO, every running rally shows up here.
            </p>
            <Link href="/" className="nav-link justify-center">
              Back to schedule
            </Link>
          </div>
        ) : (
          <>
            <header className="mb-5">
              <p className="text-rally-muted text-xs font-semibold uppercase tracking-[0.16em]">
                {live.length === 1 ? "1 live rally" : `${live.length} live rallies`}
              </p>
              {multi && (
                <p className="text-rally-muted text-sm mt-1">
                  All running rallies on one board — scroll to see each throw countdown.
                </p>
              )}
            </header>

            <div
              className={
                multi
                  ? "grid gap-8 md:grid-cols-2 md:gap-6 items-start"
                  : "flex flex-col"
              }
            >
              {live.map((event) => (
                <section
                  key={event.id}
                  className={
                    multi
                      ? "rounded-2xl border border-rally-border bg-rally-surface/40 p-4"
                      : undefined
                  }
                >
                  <PublicRallyLiveView
                    eventId={event.id}
                    initialEvent={event}
                    compact={multi}
                  />
                </section>
              ))}
            </div>

            <p className="text-rally-muted text-xs text-center mt-6 mb-4">
              No login required — watch this page for every live launch countdown.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
