"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useServerClock } from "@/hooks/useServerClock";
import { useCountdown } from "@/hooks/useCountdown";
import { useEventSocket, type SerializedEvent } from "@/hooks/useEventSocket";
import { formatArrivalTime, formatGather, statusLabel } from "@/lib/display";

interface NotificationMonitor {
  callerName: string;
  assignmentId: string;
  launchTime: string;
  status: string;
  hasActiveDevice: boolean;
  devices: Array<{ platform: string; active: boolean }>;
  notifications: Array<{
    type: string;
    scheduledAt: string;
    sentAt: string | null;
    status: string;
    latencyMs: number | null;
  }>;
}

interface EventDetail extends SerializedEvent {
  notificationMonitor?: NotificationMonitor[];
}

export default function AdminEventPage({ params }: { params: { id: string } }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [callers, setCallers] = useState<Array<{ id: string; displayName: string; username: string }>>([]);
  const [addUserId, setAddUserId] = useState("");
  const [addMarch, setAddMarch] = useState("8:00");
  const [rescheduleConfirm, setRescheduleConfirm] = useState(false);

  const { correctedNow } = useServerClock({ activeRally: event?.status === "ACTIVE" });

  const nextLaunchMs = event?.nextCaller
    ? new Date(event.nextCaller.launchTime).getTime()
    : null;
  const { display: nextCountdown } = useCountdown(nextLaunchMs, correctedNow);

  const loadEvent = useCallback(() => {
    fetch(`/api/events/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return;
        setEvent(data);
      });
  }, [params.id]);

  useEventSocket({
    eventId: params.id,
    onEventUpdate: (e) => setEvent((prev) => ({ ...prev, ...e })),
    onEventCancelled: () => loadEvent(),
  });

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && user.role !== "ADMIN") router.push("/caller");
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      loadEvent();
      fetch("/api/admin/users")
        .then((r) => r.json())
        .then((data) =>
          setCallers(
            (data.users || []).filter((u: { role: string; active: boolean }) => u.role === "CALLER" && u.active)
          )
        );
    }
  }, [user, loadEvent]);

  const addCaller = async () => {
    if (!addUserId || !addMarch) return;
    await fetch(`/api/events/${params.id}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: addUserId, marchDuration: addMarch }),
    });
    loadEvent();
  };

  const startRally = async () => {
    await fetch(`/api/events/${params.id}/start`, { method: "POST" });
    loadEvent();
  };

  const cancelRally = async () => {
    if (!confirm("Cancel this rally?")) return;
    await fetch(`/api/events/${params.id}`, { method: "DELETE" });
    router.push("/admin");
  };

  if (loading || !event) {
    return <div className="p-8 text-center text-rally-muted">Loading...</div>;
  }

  const canEdit = event.status === "DRAFT" || event.status === "READY";
  const isActive = event.status === "ACTIVE";

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      <Link href="/admin" className="text-rally-muted text-sm hover:text-rally-accent">
        ← Back
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-rally-muted text-sm">{event.status}{event.isTestMode ? " · TEST" : ""}</p>
      </header>

      <section className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg">
        <p className="text-rally-muted text-xs">TARGET ARRIVAL</p>
        <p className="text-xl font-bold font-mono">{formatArrivalTime(event.targetArrivalTime)}</p>
        <p className="text-rally-muted text-sm mt-2">GATHER: {formatGather(event.gatherDurationSeconds)}</p>
        <p className="text-rally-muted text-sm">ALL ARRIVE: {formatArrivalTime(event.targetArrivalTime)}</p>
      </section>

      {event.nextCaller && isActive && (
        <section className="p-4 mb-4 bg-rally-accent/20 border border-rally-accent rounded-lg text-center">
          <p className="text-rally-muted text-xs">NEXT CALLER</p>
          <p className="text-2xl font-bold">{event.nextCaller.displayName.toUpperCase()}</p>
          <p className="text-rally-muted text-xs mt-1">THROW IN</p>
          <p className="text-3xl font-mono font-bold text-rally-accent">{nextCountdown}</p>
        </section>
      )}

      <section className="mb-4">
        <h2 className="text-rally-muted text-xs mb-2">CALLERS</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-rally-muted text-left">
                <th className="pb-2">Caller</th>
                <th className="pb-2">March</th>
                <th className="pb-2">Launch</th>
                <th className="pb-2">Expected</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {event.assignments.map((a) => (
                <tr key={a.id} className="border-t border-rally-border">
                  <td className="py-2 font-medium">{a.displayName}</td>
                  <td className="py-2 font-mono">{a.marchFormatted}</td>
                  <td className="py-2 font-mono">{formatArrivalTime(a.launchTime)}</td>
                  <td className="py-2 font-mono">{formatArrivalTime(a.expectedArrivalTime)}</td>
                  <td className="py-2 text-xs">{statusLabel(a.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canEdit && (
        <section className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg">
          <h3 className="text-rally-muted text-xs mb-2">ADD CALLER</h3>
          <div className="flex flex-col gap-2">
            <select
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
              className="px-3 py-2 bg-rally-bg border border-rally-border rounded text-rally-text"
            >
              <option value="">Select caller...</option>
              {callers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName} ({c.username})
                </option>
              ))}
            </select>
            <input
              value={addMarch}
              onChange={(e) => setAddMarch(e.target.value)}
              placeholder="March (M:SS)"
              className="px-3 py-2 bg-rally-bg border border-rally-border rounded text-rally-text"
            />
            <button
              onClick={addCaller}
              className="py-2 bg-rally-surface border border-rally-border rounded font-bold text-sm"
            >
              ADD CALLER
            </button>
          </div>
        </section>
      )}

      <Timeline event={event} />

      {canEdit && event.assignments.length > 0 && (
        <button
          onClick={startRally}
          className="w-full py-4 mb-3 bg-rally-success text-white font-bold text-lg rounded-lg"
        >
          START RALLY
        </button>
      )}

      {isActive && (
        <button
          onClick={() => setRescheduleConfirm(true)}
          className="w-full py-3 mb-3 bg-rally-warning/20 border border-rally-warning text-rally-warning font-bold rounded-lg text-sm"
        >
          RESCHEDULE (EDIT TIMING)
        </button>
      )}

      {rescheduleConfirm && (
        <RescheduleForm
          event={event}
          onDone={() => {
            setRescheduleConfirm(false);
            loadEvent();
          }}
          onCancel={() => setRescheduleConfirm(false)}
        />
      )}

      {(canEdit || isActive) && (
        <button
          onClick={cancelRally}
          className="w-full py-3 mb-6 bg-rally-danger/20 border border-rally-danger text-rally-danger font-bold rounded-lg text-sm"
        >
          CANCEL RALLY
        </button>
      )}

      {event.notificationMonitor && (
        <section className="mb-8">
          <h2 className="text-rally-muted text-xs mb-2">NOTIFICATION MONITOR</h2>
          {event.notificationMonitor.map((m) => (
            <div key={m.assignmentId} className="p-3 mb-2 bg-rally-surface border border-rally-border rounded-lg text-sm">
              <div className="flex justify-between">
                <span className="font-bold">{m.callerName}</span>
                <span className={m.hasActiveDevice ? "text-rally-success" : "text-rally-warning"}>
                  {m.hasActiveDevice
                    ? `✓ ${m.devices.map((d) => d.platform).join(", ")}`
                    : "⚠ No active device"}
                </span>
              </div>
              {m.notifications.map((n) => (
                <div key={n.type} className="flex justify-between text-xs text-rally-muted mt-1">
                  <span>{n.type}</span>
                  <span>
                    {formatArrivalTime(n.scheduledAt)} · {n.status}
                    {n.latencyMs != null ? ` (+${n.latencyMs}ms)` : ""}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

function Timeline({ event }: { event: SerializedEvent }) {
  const arrival = formatArrivalTime(event.targetArrivalTime);
  const gather = formatGather(event.gatherDurationSeconds);

  return (
    <section className="mb-4 p-4 bg-rally-surface border border-rally-border rounded-lg">
      <h2 className="text-rally-muted text-xs mb-3">TIMELINE</h2>
      <div className="flex flex-col gap-3 text-xs font-mono">
        {event.assignments.map((a) => (
          <div key={a.id} className="border-l-2 border-rally-accent pl-3">
            <p className="font-bold">{formatArrivalTime(a.launchTime)}</p>
            <p>{a.displayName} throws</p>
            <p className="text-rally-muted">│ {gather} gather</p>
            <p className="text-rally-muted">└→ {arrival}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RescheduleForm({
  event,
  onDone,
  onCancel,
}: {
  event: SerializedEvent;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(event.targetArrivalTime.slice(0, 10));
  const [time, setTime] = useState(
    new Date(event.targetArrivalTime).toTimeString().slice(0, 5)
  );
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    const targetArrivalTime = new Date(`${date}T${time}:00`).toISOString();
    await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetArrivalTime, reschedule: true }),
    });
    setLoading(false);
    onDone();
  };

  return (
    <div className="p-4 mb-4 bg-rally-warning/10 border border-rally-warning rounded-lg">
      <p className="text-sm mb-3">
        Changing this rally will reschedule caller notifications.
      </p>
      <div className="flex gap-2 mb-3">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 px-3 py-2 bg-rally-bg border border-rally-border rounded"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="flex-1 px-3 py-2 bg-rally-bg border border-rally-border rounded"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 border border-rally-border rounded">
          CANCEL
        </button>
        <button
          onClick={submit}
          disabled={loading}
          className="flex-1 py-2 bg-rally-warning text-black font-bold rounded"
        >
          {loading ? "..." : "RESCHEDULE"}
        </button>
      </div>
    </div>
  );
}
