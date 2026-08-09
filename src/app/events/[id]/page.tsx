"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useServerClock } from "@/hooks/useServerClock";
import { useCountdown } from "@/hooks/useCountdown";
import { useEventSocket } from "@/hooks/useEventSocket";
import { formatArrivalTime, formatGather, statusLabel } from "@/lib/display";
import type { SerializedEvent } from "@/hooks/useEventSocket";

export default function PublicEventPage({ params }: { params: { id: string } }) {
  const { user, loading: authLoading } = useAuth();
  const [event, setEvent] = useState<SerializedEvent | null>(null);
  const [error, setError] = useState(false);
  const { correctedNow } = useServerClock({ activeRally: event?.status === "ACTIVE" });

  const nextLaunchMs = event?.nextCaller
    ? new Date(event.nextCaller.launchTime).getTime()
    : null;
  const { display: nextCountdown } = useCountdown(nextLaunchMs, correctedNow);

  const loadEvent = () => {
    fetch(`/api/events/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then(setEvent)
      .catch(() => setError(true));
  };

  useEventSocket({
    eventId: params.id,
    onEventUpdate: (e) => setEvent(e),
  });

  useEffect(() => {
    loadEvent();
  }, [params.id]);

  if (error) {
    return (
      <main className="min-h-screen px-4 py-8 text-center">
        <p className="text-rally-muted mb-4">Rally not found or not yet public</p>
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

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      <Link href="/" className="text-rally-muted text-sm hover:text-rally-accent">
        ← Schedule
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-rally-muted text-sm">{event.status}</p>
      </header>

      <section className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg">
        <p className="text-rally-muted text-xs">TARGET ARRIVAL</p>
        <p className="text-xl font-bold font-mono">{formatArrivalTime(event.targetArrivalTime)}</p>
        <p className="text-rally-muted text-sm mt-2">GATHER: {formatGather(event.gatherDurationSeconds)}</p>
      </section>

      {event.nextCaller && isActive && (
        <section className="p-4 mb-4 bg-rally-accent/20 border border-rally-accent rounded-lg text-center">
          <p className="text-rally-muted text-xs">NEXT CALLER</p>
          <p className="text-2xl font-bold">{event.nextCaller.displayName.toUpperCase()}</p>
          <p className="text-rally-muted text-xs mt-1">THROW IN</p>
          <p className="text-3xl font-mono font-bold text-rally-accent">{nextCountdown}</p>
        </section>
      )}

      <section className="mb-6">
        <h2 className="text-rally-muted text-xs mb-2">CALLERS</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-rally-muted text-left">
                <th className="pb-2">Caller</th>
                <th className="pb-2">March</th>
                <th className="pb-2">Launch</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {event.assignments.map((a) => (
                <tr key={a.id} className="border-t border-rally-border">
                  <td className="py-2 font-medium">{a.displayName}</td>
                  <td className="py-2 font-mono">{a.marchFormatted}</td>
                  <td className="py-2 font-mono">{formatArrivalTime(a.launchTime)}</td>
                  <td className="py-2 text-xs">{statusLabel(a.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-rally-muted text-xs mt-3">
          All expected to arrive: {formatArrivalTime(event.targetArrivalTime)}
        </p>
      </section>

      {!authLoading && (
        <footer className="text-center text-sm">
          {user ? (
            <Link
              href={user.role === "ADMIN" ? `/admin/events/${event.id}` : `/caller/events/${event.id}`}
              className="text-rally-accent font-bold hover:underline"
            >
              {user.role === "ADMIN" ? "Manage rally →" : "My rally view →"}
            </Link>
          ) : (
            <Link href="/login" className="text-rally-muted hover:text-rally-accent">
              Log in for notifications or admin controls
            </Link>
          )}
        </footer>
      )}
    </main>
  );
}
