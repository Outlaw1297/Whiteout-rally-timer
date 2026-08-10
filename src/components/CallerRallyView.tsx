"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useServerClock } from "@/hooks/useServerClock";
import { useCountdown } from "@/hooks/useCountdown";
import { useEventSocket, type SerializedEvent } from "@/hooks/useEventSocket";
import { NotificationButton } from "@/components/NotificationButton";
import { PushNotificationsProvider } from "@/components/PushNotificationsProvider";
import { StatusBanner } from "@/components/StatusBanner";
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
    <div className="flex flex-col flex-1">
      <header className="mt-2 mb-6 text-center">
        <p className="text-rally-muted text-xs">⚔️</p>
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-rally-muted text-sm">{user.displayName.toUpperCase()}</p>
        <p className="text-rally-muted text-xs mt-1">
          {event.status === "ACTIVE"
            ? "● LIVE"
            : waitingForGo
              ? "Waiting for GO"
              : event.status}
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

      <section
        className={`p-8 mb-6 rounded-xl text-center ${
          isNow
            ? "bg-rally-danger/30 border-2 border-rally-danger animate-pulse"
            : "bg-rally-surface border border-rally-border"
        }`}
      >
        <p className="text-rally-muted text-xs mb-1">YOUR RALLY</p>
        <p className="text-2xl font-mono font-bold mb-4">
          {formatArrivalTime(assignment.launchTime)}
        </p>
        <p className="text-rally-muted text-xs mb-2">THROW RALLY IN</p>
        <p
          className={`text-5xl font-mono font-bold ${
            isNow ? "text-rally-danger" : "text-rally-accent"
          }`}
        >
          {waitingForGo ? "WAITING" : isNow ? "🚨 THROW RALLY NOW" : countdown}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-4 mb-6 text-center">
        <div className="p-3 bg-rally-surface border border-rally-border rounded-lg">
          <p className="text-rally-muted text-xs">YOUR MARCH</p>
          {canEditMarch ? (
            <div className="mt-1 space-y-2">
              <input
                value={marchDraft}
                onChange={(e) => setMarchDraft(e.target.value)}
                placeholder="M:SS"
                className="w-full px-2 py-1 bg-rally-bg border border-rally-border rounded font-mono text-lg text-center"
                aria-label="Your march time"
              />
              <button
                type="button"
                onClick={saveMarch}
                disabled={marchSaving}
                className="w-full py-1.5 bg-rally-accent text-white text-xs font-bold rounded disabled:opacity-50"
              >
                {marchSaving ? "SAVING…" : "SAVE MARCH"}
              </button>
              <p className="text-rally-muted text-[10px]">
                Set your march to the target. Admin can still change it.
              </p>
            </div>
          ) : (
            <p className="text-xl font-mono font-bold">{assignment.marchFormatted}</p>
          )}
        </div>
        <div className="p-3 bg-rally-surface border border-rally-border rounded-lg">
          <p className="text-rally-muted text-xs">RALLY TIME</p>
          <p className="text-xl font-mono font-bold">
            {formatGather(event.gatherDurationSeconds)}
          </p>
        </div>
        <div className="col-span-2 p-3 bg-rally-surface border border-rally-border rounded-lg">
          <p className="text-rally-muted text-xs">EXPECTED ARRIVAL</p>
          <p className="text-xl font-mono font-bold">
            {formatArrivalTime(assignment.expectedArrivalTime)}
          </p>
        </div>
        <div className="col-span-2 p-3 bg-rally-surface border border-rally-border rounded-lg">
          <p className="text-rally-muted text-xs">TARGET ARRIVAL</p>
          <p className="text-xl font-mono font-bold">
            {formatArrivalTime(event.targetArrivalTime)}
          </p>
        </div>
      </section>

      <div className="mb-6">
        <PushNotificationsProvider>
          <NotificationButton />
        </PushNotificationsProvider>
      </div>

      {showSettingsLink && (
        <p className="text-center mb-6">
          <Link href="/caller/settings" className="text-rally-muted text-xs hover:text-rally-accent">
            Notification settings & other rallies →
          </Link>
        </p>
      )}

      <section className="mt-auto">
        {waitingForGo ? (
          <div className="p-4 bg-rally-surface border border-rally-border rounded-lg text-center">
            <p className="text-rally-muted text-sm">
              Launch time appears when an admin presses GO.
            </p>
          </div>
        ) : confirmed ? (
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
