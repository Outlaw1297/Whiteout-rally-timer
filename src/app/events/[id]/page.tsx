"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useServerClock } from "@/hooks/useServerClock";
import { useCountdown } from "@/hooks/useCountdown";
import { useEventSocket } from "@/hooks/useEventSocket";
import { useNextCaller } from "@/hooks/useNextCaller";
import { CallerCountdownRow } from "@/components/CallerCountdownRow";
import { MarchDuplicateNotice } from "@/components/MarchDuplicateNotice";
import { HomeButton } from "@/components/HomeButton";
import { HitOrderPreview } from "@/components/HitOrderPreview";
import { RallyTimeline } from "@/components/RallyTimeline";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AppShell, Panel, SectionLabel } from "@/components/ui/AppShell";
import { formatArrivalTime, formatGather } from "@/lib/display";
import {
  getMarchDuplicateGroups,
  groupAssignmentsByLaunchSlot,
} from "@/lib/march-groups";
import type { SerializedEvent } from "@/hooks/useEventSocket";

export default function PublicEventPage({ params }: { params: { id: string } }) {
  const { user, loading: authLoading } = useAuth();
  const [event, setEvent] = useState<SerializedEvent | null>(null);
  const [error, setError] = useState(false);
  const { correctedNow } = useServerClock({
    activeRally: event?.status === "ACTIVE",
    useWebSocket: false,
  });

  const nextCaller = useNextCaller(event?.assignments, correctedNow, event?.status === "ACTIVE");
  const nextLaunchMs = nextCaller?.launchTime ? new Date(nextCaller.launchTime).getTime() : null;
  const { display: nextCountdown, isNow: nextIsNow } = useCountdown(nextLaunchMs, correctedNow);

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
      <AppShell className="text-center page-enter">
        <p className="text-rally-muted mb-4">Rally not found</p>
        <Link href="/" className="nav-link justify-center">
          ← Back to schedule
        </Link>
      </AppShell>
    );
  }

  if (!event) {
    return <div className="p-8 text-center text-rally-muted">Loading…</div>;
  }

  const isActive = event.status === "ACTIVE";
  const isTemplate = event.status === "READY" || event.status === "DRAFT";
  const marchDuplicateGroups = getMarchDuplicateGroups(event.assignments);
  const launchSlots = groupAssignmentsByLaunchSlot(event.assignments);
  const templateSlots = groupAssignmentsByLaunchSlot(
    event.assignments.map((a) => ({ ...a, launchTime: null }))
  );

  return (
    <AppShell className="page-enter" wide>
      <div className="flex items-center justify-between gap-3 mb-4 max-w-lg mx-auto w-full md:max-w-none">
        <BrandLogo size="sm" />
        <HomeButton />
      </div>

      <div className="max-w-lg mx-auto md:max-w-none">
        <header className="mb-5">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {isTemplate ? (
              <StatusBadge tone="warning">Waiting for GO</StatusBadge>
            ) : isActive ? (
              <StatusBadge tone="live" pulse>
                ● Live
              </StatusBadge>
            ) : (
              <StatusBadge tone="neutral">{event.status}</StatusBadge>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-rally-snow tracking-tight">
            {event.name}
          </h1>
        </header>

        {marchDuplicateGroups.length > 0 && (
          <MarchDuplicateNotice groups={marchDuplicateGroups} />
        )}

        <Panel className="mb-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <SectionLabel>Rally time</SectionLabel>
              <p className="timer-display text-xl text-rally-snow mt-1">
                {formatGather(event.gatherDurationSeconds)}
              </p>
            </div>
            {!isTemplate && event.targetArrivalTime && (
              <div>
                <SectionLabel>All arrive</SectionLabel>
                <p className="timer-display text-xl text-rally-ice mt-1">
                  {formatArrivalTime(event.targetArrivalTime)}
                </p>
              </div>
            )}
          </div>
        </Panel>

        {nextCaller && isActive && (
          <Panel
            launch={nextIsNow}
            accent={!nextIsNow}
            className="mb-4 text-center !p-5"
          >
            <SectionLabel>Next up</SectionLabel>
            <p className="text-2xl font-bold text-rally-snow mt-1 tracking-wide uppercase">
              {nextCaller.displayName}
            </p>
            {nextIsNow ? (
              <p className="mt-2 text-4xl font-black uppercase text-rally-launch tracking-tight">
                Launch Now
              </p>
            ) : (
              <p className="timer-display text-4xl text-rally-ice mt-2">{nextCountdown}</p>
            )}
          </Panel>
        )}

        {!isTemplate && launchSlots.length > 0 && (
          <RallyTimeline
            slots={launchSlots.map((slot) => {
              const launchMs = slot.launchTime ? new Date(slot.launchTime).getTime() : null;
              const now = correctedNow();
              const isNow =
                launchMs !== null && launchMs <= now && slot.status !== "LAUNCHED";
              return {
                id: slot.assignmentIds.join("-"),
                displayNames: slot.displayNames,
                marchFormatted: slot.marchFormatted,
                launchTime: slot.launchTime,
                status: slot.status,
                highlight: slot.assignmentIds.some((id) =>
                  nextCaller?.assignmentIds.includes(id)
                ),
                isNow,
              };
            })}
            targetArrivalTime={event.targetArrivalTime}
          />
        )}

        {isTemplate && event.assignments.length > 0 && (
          <HitOrderPreview
            assignments={event.assignments}
            firstCallerLeadSeconds={event.firstCallerLeadSeconds ?? 3}
          />
        )}

        <section className="flex flex-col gap-3 mb-6">
          <SectionLabel>Callers</SectionLabel>
          {isTemplate ? (
            templateSlots.map((slot) => (
              <div
                key={slot.assignmentIds.join("-")}
                className="rounded-xl border border-rally-border bg-rally-surface p-3"
              >
                <p className="font-bold text-rally-snow">{slot.displayNames.join(", ")}</p>
                <p className="text-rally-muted text-sm font-mono mt-0.5">
                  March {slot.marchFormatted}
                </p>
                {slot.displayNames.length > 1 && (
                  <p className="text-rally-warning text-xs mt-1 font-semibold">
                    Launch together
                  </p>
                )}
              </div>
            ))
          ) : (
            launchSlots.map((slot) => (
              <CallerCountdownRow
                key={slot.assignmentIds.join("-")}
                displayNames={slot.displayNames}
                marchFormatted={slot.marchFormatted}
                launchTime={slot.launchTime}
                status={slot.status}
                correctedNow={correctedNow}
                highlight={slot.assignmentIds.some((id) =>
                  nextCaller?.assignmentIds.includes(id)
                )}
              />
            ))
          )}
        </section>

        <p className="text-rally-muted text-xs text-center mb-4">
          No login required — watch this page for your launch countdown.
        </p>

        {!authLoading && user && (
          <footer className="text-center text-sm pb-2">
            <Link
              href={
                user.role === "ADMIN" || user.role === "DEVELOPER"
                  ? `/admin/events/${event.id}`
                  : `/caller/events/${event.id}`
              }
              className="nav-link-active"
            >
              {user.role === "ADMIN" || user.role === "DEVELOPER" ? "Manage →" : "My view →"}
            </Link>
          </footer>
        )}
      </div>
    </AppShell>
  );
}
