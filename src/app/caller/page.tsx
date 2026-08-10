"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useServerClock } from "@/hooks/useServerClock";
import { useCountdown } from "@/hooks/useCountdown";
import { NotificationButton } from "@/components/NotificationButton";
import { PushNotificationsProvider } from "@/components/PushNotificationsProvider";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { HomeButton } from "@/components/HomeButton";
import { formatArrivalTime, formatGather } from "@/lib/display";
import type { SerializedEvent } from "@/hooks/useEventSocket";

export default function CallerDashboard() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<SerializedEvent[]>([]);
  const { correctedNow } = useServerClock({ activeRally: true });

  const myAssignments = events
    .map((event) => {
      const assignment = event.assignments.find((a) => a.userId === user?.id);
      return assignment ? { event, assignment } : null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aTime = a!.assignment.launchTime ?? "";
      const bTime = b!.assignment.launchTime ?? "";
      return aTime.localeCompare(bTime);
    }) as Array<{
    event: SerializedEvent;
    assignment: SerializedEvent["assignments"][0];
  }>;

  const now = correctedNow();
  const nextUp = myAssignments.find(
    (a) =>
      a.assignment.status === "WAITING" &&
      a.assignment.launchTime &&
      new Date(a.assignment.launchTime).getTime() > now
  );

  const nextLaunchMs = nextUp?.assignment.launchTime
    ? new Date(nextUp.assignment.launchTime).getTime()
    : null;
  const { display: countdown, isNow } = useCountdown(nextLaunchMs, correctedNow);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && user.role === "ADMIN") router.push("/admin");
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role === "CALLER") {
      fetch("/api/events")
        .then((r) => r.json())
        .then((data) => setEvents(data.events || []));
    }
  }, [user]);

  if (loading || !user) {
    return <div className="p-8 text-center text-rally-muted">Loading...</div>;
  }

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-rally-accent">WELCOME, {user.displayName.toUpperCase()}</h1>
        </div>
        <div className="flex items-center gap-3">
          <HomeButton />
          <button onClick={logout} className="text-rally-muted text-sm hover:text-rally-danger">
            Logout
          </button>
        </div>
      </header>

      {nextUp && (
        <section className="p-6 mb-6 bg-rally-accent/20 border-2 border-rally-accent rounded-xl text-center">
          <p className="text-rally-muted text-xs">NEXT RALLY</p>
          <p className="text-2xl font-bold mb-2">{nextUp.event.name}</p>
          <p className="text-rally-muted text-xs">THROW RALLY IN</p>
          <p className={`text-4xl font-mono font-bold ${isNow ? "text-rally-danger animate-pulse" : "text-rally-accent"}`}>
            {isNow ? "🚨 THROW RALLY NOW" : countdown}
          </p>
          <Link
            href={`/caller/events/${nextUp.event.id}`}
            className="inline-block mt-4 text-rally-accent text-sm font-bold"
          >
            Open active view →
          </Link>
        </section>
      )}

      <section className="mb-6">
        <PushNotificationsProvider>
          <NotificationButton />
        </PushNotificationsProvider>
      </section>

      <NotificationPreferences />

      <ChangePasswordForm />

      <section className="flex flex-col gap-4">
        <h2 className="text-rally-muted text-xs">UPCOMING ASSIGNMENTS</h2>
        {myAssignments.length === 0 && (
          <p className="text-rally-muted text-center py-8">No rally assignments yet</p>
        )}
        {myAssignments.map(({ event, assignment }) => (
          <Link
            key={assignment.id}
            href={`/caller/events/${event.id}`}
            className="block p-4 bg-rally-surface border border-rally-border rounded-lg hover:border-rally-accent"
          >
            <h2 className="font-bold text-lg">{event.name}</h2>
            <p className="text-rally-accent font-mono font-bold text-lg mt-1">
              YOUR RALLY {formatArrivalTime(assignment.launchTime)}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
              <div>
                <p className="text-rally-muted text-xs">TARGET ARRIVAL</p>
                <p className="font-mono">{formatArrivalTime(event.targetArrivalTime)}</p>
              </div>
              <div>
                <p className="text-rally-muted text-xs">EXPECTED ARRIVAL</p>
                <p className="font-mono">{formatArrivalTime(assignment.expectedArrivalTime)}</p>
              </div>
              <div>
                <p className="text-rally-muted text-xs">YOUR MARCH</p>
                <p className="font-mono">{assignment.marchFormatted}</p>
              </div>
              <div>
                <p className="text-rally-muted text-xs">GATHER</p>
                <p className="font-mono">{formatGather(event.gatherDurationSeconds)}</p>
              </div>
            </div>
            <p className="text-xs text-rally-muted mt-2">{event.status} · {assignment.status}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}

function NotificationPreferences() {
  const [prefs, setPrefs] = useState({ warn10Enabled: true, warn5Enabled: true, launchEnabled: true });

  useEffect(() => {
    fetch("/api/auth/preferences")
      .then((r) => r.json())
      .then(setPrefs);
  }, []);

  const update = async (key: string, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await fetch("/api/auth/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  };

  return (
    <section className="p-4 mb-6 bg-rally-surface border border-rally-border rounded-lg text-sm">
      <p className="text-rally-muted text-xs mb-2">WARNING NOTIFICATIONS</p>
      <label className="flex items-center gap-2 mb-1">
        <input
          type="checkbox"
          checked={prefs.warn10Enabled}
          onChange={(e) => update("warn10Enabled", e.target.checked)}
        />
        10-second warning
      </label>
      <label className="flex items-center gap-2 mb-1">
        <input
          type="checkbox"
          checked={prefs.warn5Enabled}
          onChange={(e) => update("warn5Enabled", e.target.checked)}
        />
        5-second warning
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={prefs.launchEnabled}
          onChange={(e) => update("launchEnabled", e.target.checked)}
        />
        Launch notification
      </label>
    </section>
  );
}
