"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { EventScheduleCard } from "@/components/EventScheduleCard";
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
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-rally-accent">⚔️ RALLY TIMER</h1>
          <p className="text-rally-muted text-sm">Coordinated rally schedule</p>
        </div>
        <nav className="flex flex-col items-end gap-1 text-sm">
          {!loading && user ? (
            <>
              <Link
                href={user.role === "ADMIN" || user.role === "DEVELOPER" ? "/admin" : "/caller"}
                className="text-rally-accent font-bold hover:underline"
              >
                {user.role === "ADMIN" || user.role === "DEVELOPER" ? "Admin" : "My Rallies"} →
              </Link>
              <span className="text-rally-muted text-xs">{user.displayName}</span>
            </>
          ) : (
            <Link href="/login" className="text-rally-accent font-bold hover:underline">
              Log In →
            </Link>
          )}
        </nav>
      </header>

      <p className="text-rally-muted text-sm mb-6">
        Live rally countdowns — no login needed. Open your rally link and watch for your
        launch time. Admin login is only required to create templates and press GO.
      </p>

      {fetching ? (
        <p className="text-rally-muted text-center py-12">Loading schedule...</p>
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
        <Link href="/login" className="text-rally-muted text-xs hover:text-rally-accent">
          Admin or caller login
        </Link>
      </footer>
    </main>
  );
}
