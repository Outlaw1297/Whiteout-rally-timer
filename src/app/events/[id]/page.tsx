"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useServerClock } from "@/hooks/useServerClock";
import { useCountdown } from "@/hooks/useCountdown";
import { useEventSocket } from "@/hooks/useEventSocket";
import { CallerCountdownRow } from "@/components/CallerCountdownRow";
import { formatArrivalTime, formatGather } from "@/lib/display";
import type { SerializedEvent } from "@/hooks/useEventSocket";

export default function PublicEventPage({ params }: { params: { id: string } }) {
  const { user, loading: authLoading } = useAuth();
  const [event, setEvent] = useState<SerializedEvent | null>(null);
  const [error, setError] = useState(false);
  const { correctedNow } = useServerClock({ activeRally: event?.status === "ACTIVE" });

  const nextLaunchMs = event?.nextCaller?.launchTime
    ? new Date(event.nextCaller.launchTime).getTime()
    : null;
  const { display: nextCountdown } = useCountdown(nextLaunchMs, correctedNow);

  useEventSocket({
    eventId: params.id,
    onEventUpdate: (e) => setEvent(e),
  });

  useEffect(() => {
    fetch(`/api/events/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then(setEvent)
      .catch(() => setError(true));
  }, [params.id]);

  if (error) {
    return (
      <main className="min-h-screen px-4 py-8 text-center">
        <p className="text-rally-muted mb-4">Rally not found</p>
        <Link href="/" className="text-rally-accent text-sm">
          ← Back to schedule
        </Link>
      </main>
    );
  }

  if (!event) {
    return <div className="p-8 text-center text-rally-muted">Loading...</div>;
  }

  const isActive = event.status === "ACTIVE";
  const isTemplate = event.status === "READY" || event.status === "DRAFT";

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      <Link href="/" className="text-rally-muted text-sm hover:text-rally-accent">
        ← Schedule
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-rally-muted text-sm">
          {isTemplate ? "Waiting for GO" : isActive ? "● LIVE" : event.status}
        </p>
      </header>

      <section className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg">
        <p className="text-rally-muted text-xs">GATHER</p>
        <p className="text-xl font-mono font-bold">{formatGather(event.gatherDurationSeconds)}</p>
        {!isTemplate && event.targetArrivalTime && (
          <>
            <p className="text-rally-muted text-xs mt-3">ALL ARRIVE</p>
            <p className="text-xl font-mono font-bold">{formatArrivalTime(event.targetArrivalTime)}</p>
          </>
        )}
      </section>

      {event.nextCaller && isActive && (
        <section className="p-4 mb-4 bg-rally-accent/20 border border-rally-accent rounded-lg text-center">
          <p className="text-rally-muted text-xs">NEXT CALLER</p>
          <p className="text-2xl font-bold">{event.nextCaller.displayName.toUpperCase()}</p>
          <p className="text-3xl font-mono font-bold text-rally-accent">{nextCountdown}</p>
        </section>
      )}

      <section className="flex flex-col gap-3 mb-6">
        <h2 className="text-rally-muted text-xs">CALLERS</h2>
        {isTemplate ? (
          event.assignments.map((a) => (
            <div key={a.id} className="p-3 bg-rally-surface border border-rally-border rounded-lg">
              <p className="font-bold">{a.displayName}</p>
              <p className="text-rally-muted text-sm font-mono">March {a.marchFormatted}</p>
            </div>
          ))
        ) : (
          event.assignments.map((a) => (
            <CallerCountdownRow
              key={a.id}
              displayName={a.displayName}
              marchFormatted={a.marchFormatted}
              launchTime={a.launchTime}
              status={a.status}
              correctedNow={correctedNow}
              highlight={event.nextCaller?.assignmentId === a.id}
            />
          ))
        )}
      </section>

      <p className="text-rally-muted text-xs text-center mb-4">
        No login required — watch this page for your launch countdown.
      </p>

      {!authLoading && user && (
        <footer className="text-center text-sm">
          <Link
            href={user.role === "ADMIN" ? `/admin/events/${event.id}` : `/caller/events/${event.id}`}
            className="text-rally-accent font-bold hover:underline"
          >
            {user.role === "ADMIN" ? "Manage →" : "My view →"}
          </Link>
        </footer>
      )}
    </main>
  );
}
