"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogIn, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { EventScheduleCard } from "@/components/EventScheduleCard";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AppShell, AppHeader } from "@/components/ui/AppShell";
import type { SerializedEvent } from "@/hooks/useEventSocket";

export default function HomePage() {
  const { user, loading } = useAuth();
  const [events, setEvents] = useState<SerializedEvent[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((data) => setEvents(data.events || []))
      .finally(() => setFetching(false));
  }, []);

  return (
    <AppShell className="page-enter">
      <AppHeader
        left={<BrandLogo size="md" />}
        right={
          !loading && user ? (
            <div className="flex flex-col items-end gap-0.5">
              <Link
                href={user.role === "ADMIN" || user.role === "DEVELOPER" ? "/admin" : "/caller"}
                className="nav-link-active inline-flex items-center gap-1"
              >
                {user.role === "ADMIN" || user.role === "DEVELOPER" ? "Admin" : "My Rallies"}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
              <span className="text-rally-muted text-xs">{user.displayName}</span>
            </div>
          ) : (
            <Link href="/login" className="btn-secondary !py-2 !px-3 !min-h-[40px] text-xs">
              <LogIn className="h-3.5 w-3.5" aria-hidden />
              Log in
            </Link>
          )
        }
      />

      <p className="text-rally-muted text-sm mb-6 leading-relaxed">
        Live rally countdowns — no login needed. Open your rally link and watch for your
        launch time. Admin login is only required to create templates and press GO.
      </p>

      {fetching ? (
        <p className="text-rally-muted text-center py-12">Loading schedule…</p>
      ) : events.length === 0 ? (
        <p className="text-rally-muted text-center py-12">No upcoming rallies scheduled</p>
      ) : (
        <section className="flex flex-col gap-4">
          {events.map((event) => (
            <EventScheduleCard key={event.id} event={event} />
          ))}
        </section>
      )}

      <footer className="mt-10 pt-6 border-t border-rally-border text-center">
        <Link href="/login" className="nav-link text-xs justify-center">
          Admin or caller login
        </Link>
      </footer>
    </AppShell>
  );
}
