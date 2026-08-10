"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { HomeButton } from "@/components/HomeButton";
import { NotificationPreferences } from "@/components/NotificationPreferences";
import { NotificationButton } from "@/components/NotificationButton";
import { PushNotificationsProvider } from "@/components/PushNotificationsProvider";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { formatArrivalTime, formatGather } from "@/lib/display";
import type { SerializedEvent } from "@/hooks/useEventSocket";

export default function CallerSettingsPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<SerializedEvent[]>([]);

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

  const myAssignments = events
    .map((event) => {
      const assignment = event.assignments.find((a) => a.userId === user.id);
      return assignment ? { event, assignment } : null;
    })
    .filter(Boolean) as Array<{
    event: SerializedEvent;
    assignment: SerializedEvent["assignments"][0];
  }>;

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <Link href="/caller" className="text-rally-muted text-sm hover:text-rally-accent">
          ← Home
        </Link>
        <div className="flex items-center gap-3">
          <HomeButton />
          <button onClick={logout} className="text-rally-muted text-sm hover:text-rally-danger">
            Logout
          </button>
        </div>
      </div>

      <h1 className="text-xl font-bold mb-4">Caller settings</h1>

      <section className="mb-6">
        <PushNotificationsProvider>
          <NotificationButton />
        </PushNotificationsProvider>
        <p className="text-center mt-3">
          <Link href="/fix-notifications" className="text-rally-muted text-xs hover:text-rally-accent">
            Android: alerts only in top bar? Enable Pop on screen →
          </Link>
        </p>
      </section>

      <NotificationPreferences />

      <ChangePasswordForm />

      <section className="flex flex-col gap-4 mt-6">
        <h2 className="text-rally-muted text-xs">ALL ASSIGNMENTS</h2>
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
            <p className="text-xs text-rally-muted mt-2">
              {event.status} · {assignment.status}
            </p>
          </Link>
        ))}
      </section>
    </main>
  );
}
