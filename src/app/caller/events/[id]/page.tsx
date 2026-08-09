"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useServerClock } from "@/hooks/useServerClock";
import { useCountdown } from "@/hooks/useCountdown";
import { useEventSocket, type SerializedEvent } from "@/hooks/useEventSocket";
import { NotificationButton } from "@/components/NotificationButton";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { ServerClock } from "@/components/ServerClock";
import { formatArrivalTime, formatGather } from "@/lib/display";

export default function CallerEventPage({ params }: { params: { id: string } }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [event, setEvent] = useState<SerializedEvent | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const { correctedNow, isLive } = useServerClock({
    activeRally: true,
    useWebSocket: true,
  });

  const assignment = event?.assignments.find((a) => a.userId === user?.id) ?? null;
  const launchMs =
    assignment?.launchTime ? new Date(assignment.launchTime).getTime() : null;
  const { display: countdown, isNow } = useCountdown(launchMs, correctedNow);

  const loadEvent = useCallback(() => {
    fetch(`/api/events/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return;
        setEvent(data);
        const mine = data.assignments?.find((a: { userId: string }) => a.userId === user?.id);
        if (mine?.status === "LAUNCHED") setConfirmed(true);
      });
  }, [params.id, user?.id]);

  useEventSocket({
    eventId: params.id,
    onEventUpdate: (e) => setEvent(e),
  });

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (user) loadEvent();
  }, [user, loadEvent]);

  const confirmLaunch = async () => {
    if (!assignment) return;
    const res = await fetch(`/api/assignments/${assignment.id}/confirm-launch`, {
      method: "POST",
    });
    if (res.ok) setConfirmed(true);
  };

  if (loading || !event || !assignment || !user) {
    return <div className="p-8 text-center text-rally-muted">Loading...</div>;
  }

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto flex flex-col">
      <Link href="/caller" className="text-rally-muted text-sm hover:text-rally-accent">
        ← Dashboard
      </Link>

      <header className="mt-4 mb-6 text-center">
        <p className="text-rally-muted text-xs">⚔️</p>
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-rally-muted text-sm">{user.displayName.toUpperCase()}</p>
      </header>

      <ServerClock correctedNow={correctedNow} isLive={isLive} />

      <section
        className={`p-8 mb-6 rounded-xl text-center ${
          isNow ? "bg-rally-danger/30 border-2 border-rally-danger animate-pulse" : "bg-rally-surface border border-rally-border"
        }`}
      >
        <p className="text-rally-muted text-xs mb-1">YOUR RALLY</p>
        <p className="text-2xl font-mono font-bold mb-4">{formatArrivalTime(assignment.launchTime)}</p>
        <p className="text-rally-muted text-xs mb-2">THROW RALLY IN</p>
        <p className={`text-5xl font-mono font-bold ${isNow ? "text-rally-danger" : "text-rally-accent"}`}>
          {isNow ? "🚨 THROW RALLY NOW" : countdown}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-4 mb-6 text-center">
        <div className="p-3 bg-rally-surface border border-rally-border rounded-lg">
          <p className="text-rally-muted text-xs">YOUR MARCH</p>
          <p className="text-xl font-mono font-bold">{assignment.marchFormatted}</p>
        </div>
        <div className="p-3 bg-rally-surface border border-rally-border rounded-lg">
          <p className="text-rally-muted text-xs">GATHER</p>
          <p className="text-xl font-mono font-bold">{formatGather(event.gatherDurationSeconds)}</p>
        </div>
        <div className="col-span-2 p-3 bg-rally-surface border border-rally-border rounded-lg">
          <p className="text-rally-muted text-xs">EXPECTED ARRIVAL</p>
          <p className="text-xl font-mono font-bold">{formatArrivalTime(assignment.expectedArrivalTime)}</p>
        </div>
        <div className="col-span-2 p-3 bg-rally-surface border border-rally-border rounded-lg">
          <p className="text-rally-muted text-xs">TARGET ARRIVAL</p>
          <p className="text-xl font-mono font-bold">{formatArrivalTime(event.targetArrivalTime)}</p>
        </div>
      </section>

      <div className="mb-4 flex justify-center">
        <ConnectionIndicator isLive={isLive} label={isLive ? "✓ SERVER SYNCHRONIZED" : "SYNCING..."} />
      </div>

      <div className="mb-6">
        <NotificationButton />
      </div>

      <section className="mt-auto">
        {confirmed ? (
          <div className="p-4 bg-rally-success/20 border border-rally-success rounded-lg text-center">
            <p className="text-rally-success font-bold text-lg">✓ LAUNCHED</p>
            <p className="text-rally-muted text-sm mt-1">
              Launch: {formatArrivalTime(assignment.launchTime)}
            </p>
            <p className="text-rally-muted text-sm">
              Expected arrival: {formatArrivalTime(assignment.expectedArrivalTime)}
            </p>
          </div>
        ) : (
          <button
            onClick={confirmLaunch}
            className="w-full py-5 bg-rally-success text-white font-bold text-xl rounded-lg"
          >
            RALLY LAUNCHED
          </button>
        )}
      </section>
    </main>
  );
}
