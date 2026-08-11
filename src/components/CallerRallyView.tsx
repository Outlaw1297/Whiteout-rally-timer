"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Settings, Crosshair } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useServerClock } from "@/hooks/useServerClock";
import { useCountdown } from "@/hooks/useCountdown";
import { useEventSocket, type SerializedEvent } from "@/hooks/useEventSocket";
import { NotificationButton } from "@/components/NotificationButton";
import { PushNotificationsProvider } from "@/components/PushNotificationsProvider";
import { StatusBanner } from "@/components/StatusBanner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Panel, SectionLabel } from "@/components/ui/AppShell";
import { formatArrivalTime, formatGather } from "@/lib/display";
import { parseMarchDuration } from "@/lib/timing";

/** Shared personal rally countdown used as the caller home screen. */
export function CallerRallyView({
  eventId,
  showSettingsLink = true,
}: {
  eventId: string;
  showSettingsLink?: boolean;
}) {
  const { user } = useAuth();
  const [event, setEvent] = useState<SerializedEvent | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marchDraft, setMarchDraft] = useState("");
  const [marchSaving, setMarchSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const { correctedNow } = useServerClock({
    activeRally: true,
    useWebSocket: false,
  });

  const assignment = event?.assignments.find((a) => a.userId === user?.id) ?? null;
  const launchMs = assignment?.launchTime ? new Date(assignment.launchTime).getTime() : null;
  const { display: countdown, isNow } = useCountdown(launchMs, correctedNow);

  const loadEvent = useCallback(() => {
    fetch(`/api/events/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setError(null);
        setEvent(data);
        const mine = data.assignments?.find((a: { userId: string }) => a.userId === user?.id);
        if (mine?.status === "LAUNCHED") setConfirmed(true);
        if (mine?.marchFormatted) setMarchDraft(mine.marchFormatted);
      })
      .catch(() => setError("Could not load rally"));
  }, [eventId, user?.id]);

  useEventSocket({
    eventId,
    onEventUpdate: (e) => setEvent(e),
  });

  useEffect(() => {
    if (user) loadEvent();
  }, [user, loadEvent]);

  useEffect(() => {
    if (event?.status !== "ACTIVE") return;
    const interval = setInterval(loadEvent, 2000);
    return () => clearInterval(interval);
  }, [event?.status, loadEvent]);

  const confirmLaunch = async () => {
    if (!assignment) return;
    const res = await fetch(`/api/assignments/${assignment.id}/confirm-launch`, {
      method: "POST",
    });
    if (res.ok) setConfirmed(true);
  };

  const saveMarch = async () => {
    if (!assignment || !event) return;
    if (!parseMarchDuration(marchDraft)) {
      setStatusError("Invalid march (use M:SS)");
      setStatusMsg(null);
      return;
    }
    setMarchSaving(true);
    try {
      const res = await fetch(`/api/events/${event.id}/assignments/${assignment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marchDuration: marchDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusError(data.error || "Failed to save march time");
        setStatusMsg(null);
        return;
      }
      setStatusMsg("March time saved");
      setStatusError(null);
      loadEvent();
    } finally {
      setMarchSaving(false);
    }
  };

  if (error) {
    return <p className="text-rally-danger text-center py-8">{error}</p>;
  }

  if (!event || !assignment || !user) {
    return <div className="p-8 text-center text-rally-muted">Loading rally…</div>;
  }

  const waitingForGo =
    !assignment.launchTime || event.status === "READY" || event.status === "DRAFT";
  const canEditMarch = event.status === "DRAFT" || event.status === "READY";

  return (
    <div className="flex flex-col flex-1 page-enter">
      <header className="mt-1 mb-5 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Crosshair className="h-4 w-4 text-rally-ice" aria-hidden />
          {event.status === "ACTIVE" ? (
            <StatusBadge tone="live" pulse>
              ● Live
            </StatusBadge>
          ) : waitingForGo ? (
            <StatusBadge tone="warning">Waiting for GO</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">{event.status}</StatusBadge>
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-rally-snow tracking-tight">
          {event.name}
        </h1>
        <p className="text-rally-muted text-sm mt-1 tracking-wide uppercase">
          {user.displayName}
        </p>
      </header>

      <StatusBanner
        success={statusMsg}
        error={statusError}
        onDismiss={() => {
          setStatusMsg(null);
          setStatusError(null);
        }}
      />

      <Panel launch={isNow && !waitingForGo} className="mb-5 text-center !p-6 sm:!p-8">
        <SectionLabel>Your rally</SectionLabel>
        <p className="timer-display text-3xl sm:text-4xl text-rally-snow mt-2 mb-5">
          {formatArrivalTime(assignment.launchTime)}
        </p>
        <SectionLabel>
          {isNow && !waitingForGo ? "Action" : "Throw rally in"}
        </SectionLabel>
        {waitingForGo ? (
          <p className="timer-display text-4xl sm:text-5xl text-rally-muted mt-2">WAITING</p>
        ) : isNow ? (
          <p className="mt-3 text-4xl sm:text-5xl font-black tracking-tight text-rally-launch uppercase leading-none">
            Launch Now
          </p>
        ) : (
          <p className="timer-display text-5xl sm:text-6xl text-rally-ice mt-2 leading-none">
            {countdown}
          </p>
        )}
        {!waitingForGo && assignment.launchTime && (
          <p className="text-rally-muted text-xs font-mono mt-4">
            Launch at {formatArrivalTime(assignment.launchTime)}
          </p>
        )}
      </Panel>

      <section className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-xl border border-rally-border bg-rally-surface p-3 text-center">
          <SectionLabel>Your march</SectionLabel>
          {canEditMarch ? (
            <div className="mt-2 space-y-2">
              <input
                value={marchDraft}
                onChange={(e) => setMarchDraft(e.target.value)}
                placeholder="M:SS"
                className="input-field text-center timer-display text-lg !py-2 !min-h-[40px]"
                aria-label="Your march time"
              />
              <button
                type="button"
                onClick={saveMarch}
                disabled={marchSaving}
                className="btn-primary w-full !py-2 !min-h-[40px] text-xs"
              >
                {marchSaving ? "Saving…" : "Save march"}
              </button>
              <p className="text-rally-muted text-[10px] leading-snug">
                Set your march to the target. Admin can still change it.
              </p>
            </div>
          ) : (
            <p className="timer-display text-xl text-rally-snow mt-2">
              {assignment.marchFormatted}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-rally-border bg-rally-surface p-3 text-center">
          <SectionLabel>Rally time</SectionLabel>
          <p className="timer-display text-xl text-rally-snow mt-2">
            {formatGather(event.gatherDurationSeconds)}
          </p>
        </div>
        <div className="col-span-2 rounded-xl border border-rally-border bg-rally-surface p-3 text-center">
          <SectionLabel>Expected arrival</SectionLabel>
          <p className="timer-display text-xl text-rally-snow mt-2">
            {formatArrivalTime(assignment.expectedArrivalTime)}
          </p>
        </div>
        <div className="col-span-2 rounded-xl border border-rally-border bg-rally-surface p-3 text-center">
          <SectionLabel>Target arrival</SectionLabel>
          <p className="timer-display text-xl text-rally-ice mt-2">
            {formatArrivalTime(event.targetArrivalTime)}
          </p>
        </div>
      </section>

      <div className="mb-5">
        <PushNotificationsProvider>
          <NotificationButton />
        </PushNotificationsProvider>
      </div>

      {showSettingsLink && (
        <p className="text-center mb-5">
          <Link href="/caller/settings" className="nav-link gap-1.5 text-xs">
            <Settings className="h-3.5 w-3.5" aria-hidden />
            Notification settings & other rallies
          </Link>
        </p>
      )}

      <section className="mt-auto">
        {waitingForGo ? (
          <Panel className="text-center">
            <p className="text-rally-muted text-sm">
              Launch time appears when an admin presses GO.
            </p>
          </Panel>
        ) : confirmed ? (
          <Panel className="text-center !border-rally-success/40 !bg-rally-success/10">
            <p className="text-rally-success font-bold text-lg tracking-wide">✓ Launched</p>
            <p className="text-rally-muted text-sm mt-1 font-mono">
              Launch: {formatArrivalTime(assignment.launchTime)}
            </p>
            <p className="text-rally-muted text-sm font-mono">
              Expected arrival: {formatArrivalTime(assignment.expectedArrivalTime)}
            </p>
          </Panel>
        ) : (
          <button
            onClick={confirmLaunch}
            className={`w-full py-5 rounded-xl font-bold text-xl tracking-wide ${
              isNow
                ? "bg-rally-launch text-white motion-safe:animate-launch-pulse shadow-focus"
                : "btn-success !text-xl !py-5"
            }`}
          >
            {isNow ? "Confirm — Rally Launched" : "Rally Launched"}
          </button>
        )}
      </section>
    </div>
  );
}

/** Pick the best assigned rally for a caller's home screen. */
export function pickPrimaryCallerEvent(
  events: SerializedEvent[],
  userId: string,
  nowMs: number
): SerializedEvent | null {
  const mine = events
    .map((event) => {
      const assignment = event.assignments.find((a) => a.userId === userId);
      return assignment ? { event, assignment } : null;
    })
    .filter(Boolean) as Array<{
    event: SerializedEvent;
    assignment: SerializedEvent["assignments"][0];
  }>;

  if (mine.length === 0) return null;

  const active = mine.find((m) => m.event.status === "ACTIVE");
  if (active) return active.event;

  const upcoming = mine
    .filter(
      (m) =>
        m.assignment.status === "WAITING" &&
        m.assignment.launchTime &&
        new Date(m.assignment.launchTime).getTime() > nowMs
    )
    .sort(
      (a, b) =>
        new Date(a.assignment.launchTime!).getTime() -
        new Date(b.assignment.launchTime!).getTime()
    );
  if (upcoming[0]) return upcoming[0].event;

  const ready = mine.find(
    (m) => m.event.status === "READY" || m.event.status === "DRAFT"
  );
  if (ready) return ready.event;

  return mine[0].event;
}
