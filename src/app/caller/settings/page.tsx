"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { NotificationPreferences } from "@/components/NotificationPreferences";
import { NotificationButton } from "@/components/NotificationButton";
import { PushNotificationsProvider } from "@/components/PushNotificationsProvider";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { AppShell, AppHeader, Panel, SectionLabel } from "@/components/ui/AppShell";
import { StatusBadge, statusToneForAssignment, statusToneForEvent } from "@/components/ui/StatusBadge";
import { formatArrivalTime, formatGather } from "@/lib/display";
import { restartDeviceOnboarding } from "@/lib/device-onboarding";
import type { SerializedEvent } from "@/hooks/useEventSocket";

export default function CallerSettingsPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<SerializedEvent[]>([]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && (user.role === "ADMIN" || user.role === "DEVELOPER")) router.push("/admin");
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
    <AppShell className="page-enter">
      <AppHeader
        left={
          <Link href="/caller" className="nav-link text-sm gap-1">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Home
          </Link>
        }
        right={
          <button type="button" onClick={logout} className="btn-ghost text-xs gap-1">
            <LogOut className="h-4 w-4" aria-hidden />
            Logout
          </button>
        }
      />

      <div className="mb-6">
        <BrandLogo size="sm" />
        <h1 className="text-xl font-bold text-rally-snow mt-3">Caller Settings</h1>
      </div>

      <Panel className="mb-6">
        <PushNotificationsProvider>
          <NotificationButton />
        </PushNotificationsProvider>
        <p className="text-center mt-3 space-y-2">
          <Link href="/fix-notifications" className="nav-link text-xs justify-center">
            Android: alerts only in top bar? Enable Pop on screen →
          </Link>
          <button
            type="button"
            className="nav-link text-xs justify-center w-full"
            onClick={() => {
              restartDeviceOnboarding(user.id);
              router.push("/onboarding?next=/caller/settings");
            }}
          >
            Replay device setup guide →
          </button>
        </p>
      </Panel>

      <NotificationPreferences />

      <ChangePasswordForm />

      <section className="flex flex-col gap-3 mt-6">
        <SectionLabel>All Assignments</SectionLabel>
        {myAssignments.length === 0 && (
          <p className="text-rally-muted text-center py-8">No rally assignments yet</p>
        )}
        {myAssignments.map(({ event, assignment }) => (
          <Link
            key={assignment.id}
            href={`/caller/events/${event.id}`}
            className="block"
          >
            <Panel className="hover:border-rally-ice/40 transition-colors">
              <h2 className="font-bold text-lg text-rally-snow">{event.name}</h2>
              <p className="timer-display text-lg text-rally-ice mt-1">
                Your rally {formatArrivalTime(assignment.launchTime)}
              </p>
              <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                <div>
                  <p className="label-field">Target Arrival</p>
                  <p className="font-mono text-rally-snow">{formatArrivalTime(event.targetArrivalTime)}</p>
                </div>
                <div>
                  <p className="label-field">Expected Arrival</p>
                  <p className="font-mono text-rally-snow">{formatArrivalTime(assignment.expectedArrivalTime)}</p>
                </div>
                <div>
                  <p className="label-field">Your March</p>
                  <p className="font-mono text-rally-ice">{assignment.marchFormatted}</p>
                </div>
                <div>
                  <p className="label-field">Rally Time</p>
                  <p className="font-mono">{formatGather(event.gatherDurationSeconds)}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <StatusBadge tone={statusToneForEvent(event.status)}>{event.status}</StatusBadge>
                <StatusBadge tone={statusToneForAssignment(assignment.status)}>
                  {assignment.status}
                </StatusBadge>
              </div>
            </Panel>
          </Link>
        ))}
      </section>
    </AppShell>
  );
}
