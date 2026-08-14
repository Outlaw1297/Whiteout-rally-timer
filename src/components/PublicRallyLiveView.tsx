"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useServerClock } from "@/hooks/useServerClock";
import { useCountdown } from "@/hooks/useCountdown";
import { useEventSocket, type SerializedEvent } from "@/hooks/useEventSocket";
import { useNextCaller } from "@/hooks/useNextCaller";
import { CallerCountdownRow } from "@/components/CallerCountdownRow";
import { MarchDuplicateNotice } from "@/components/MarchDuplicateNotice";
import { HitOrderPreview } from "@/components/HitOrderPreview";
import { RallyTimeline } from "@/components/RallyTimeline";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Panel, SectionLabel } from "@/components/ui/AppShell";
import { formatArrivalTime, formatGather } from "@/lib/display";
import {
  getMarchDuplicateGroups,
  groupAssignmentsByLaunchSlot,
} from "@/lib/march-groups";
import { isAdminRole } from "@/lib/roles";

export function PublicRallyLiveView({
  eventId,
  initialEvent,
  compact = false,
}: {
  eventId: string;
  initialEvent?: SerializedEvent;
  /** Tighter chrome when several rallies share one page. */
  compact?: boolean;
}) {
  const { user, loading: authLoading } = useAuth();
  const [event, setEvent] = useState<SerializedEvent | null>(initialEvent ?? null);
  const [error, setError] = useState(false);

  useEventSocket({
    eventId,
    onEventUpdate: (e) => setEvent(e),
  });

  useEffect(() => {
    let cancelled = false;
    const hadInitial = Boolean(initialEvent);
    fetch(`/api/events/${eventId}`, { credentials: "omit" })
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((data: SerializedEvent) => {
        if (!cancelled) {
          setError(false);
          setEvent(data);
        }
      })
      .catch(() => {
        if (!cancelled && !hadInitial) setError(true);
      });
    return () => {
      cancelled = true;
    };
    // Seed from initialEvent on first paint; refresh by eventId / websocket only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (error && !event) {
    return <p className="text-rally-muted text-sm text-center py-4">Rally not found</p>;
  }

  if (!event) {
    return <p className="text-rally-muted text-center py-8">Loading…</p>;
  }

  return (
    <PublicRallyLiveBody
      event={event}
      compact={compact}
      user={user}
      authLoading={authLoading}
    />
  );
}

function PublicRallyLiveBody({
  event,
  compact,
  user,
  authLoading,
}: {
  event: SerializedEvent;
  compact: boolean;
  user: ReturnType<typeof useAuth>["user"];
  authLoading: boolean;
}) {
  const isActive = event.status === "ACTIVE";
  const isTemplate = event.status === "READY" || event.status === "DRAFT";

  const { correctedNow } = useServerClock({
    activeRally: isActive,
    useWebSocket: false,
  });

  const nextCaller = useNextCaller(event.assignments, correctedNow, isActive);
  const nextLaunchMs = nextCaller?.launchTime ? new Date(nextCaller.launchTime).getTime() : null;
  const { display: nextCountdown, isNow: nextIsNow } = useCountdown(nextLaunchMs, correctedNow);

  const marchDuplicateGroups = getMarchDuplicateGroups(event.assignments);
  const launchSlots = groupAssignmentsByLaunchSlot(event.assignments);
  const templateSlots = groupAssignmentsByLaunchSlot(
    event.assignments.map((a) => ({ ...a, launchTime: null }))
  );

  return (
    <article>
      <header className={compact ? "mb-3" : "mb-5"}>
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
        <h2
          className={`font-bold text-rally-snow tracking-tight ${
            compact ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl"
          }`}
        >
          {event.name}
        </h2>
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
        <Panel launch={nextIsNow} accent={!nextIsNow} className="mb-4 text-center !p-5">
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

      <section className="flex flex-col gap-3 mb-4">
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
                <p className="text-rally-warning text-xs mt-1 font-semibold">Launch together</p>
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

      {!authLoading && user && (
        <p className="text-center text-sm">
          <Link
            href={
              isAdminRole(user.role) ? `/admin/events/${event.id}` : `/caller/events/${event.id}`
            }
            className="nav-link-active"
          >
            {isAdminRole(user.role) ? "Manage →" : "My view →"}
          </Link>
        </p>
      )}
    </article>
  );
}
