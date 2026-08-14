"use client";

import { useEffect, useState } from "react";
import { EventScheduleCard } from "@/components/EventScheduleCard";
import { PublicTopNav } from "@/components/PublicTopNav";
import { AppShell } from "@/components/ui/AppShell";
import type { SerializedEvent } from "@/hooks/useEventSocket";

export default function HomePage() {
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
      <PublicTopNav />

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
    </AppShell>
  );
}
