"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useServerClock } from "@/hooks/useServerClock";
import { useCountdown } from "@/hooks/useCountdown";
import { useEventSocket, type SerializedEvent } from "@/hooks/useEventSocket";
import { useNextCaller } from "@/hooks/useNextCaller";
import { CallerCountdownRow } from "@/components/CallerCountdownRow";
import { MarchDuplicateNotice } from "@/components/MarchDuplicateNotice";
import { PushSetupCard } from "@/components/PushSetupCard";
import { ServerClock } from "@/components/ServerClock";
import { formatArrivalTime, formatGather, statusLabel } from "@/lib/display";
import { parseMarchDuration } from "@/lib/timing";
import {
  getMarchDuplicateGroups,
  groupAssignmentsByLaunchSlot,
} from "@/lib/march-groups";

interface NotificationMonitor {
  callerName: string;
  assignmentId: string;
  launchTime: string | null;
  status: string;
  hasActiveDevice: boolean;
  hasPushAccount: boolean;
  devices: Array<{ platform: string; active: boolean }>;
  notifications: Array<{
    type: string;
    scheduledAt: string;
    sentAt: string | null;
    status: string;
    latencyMs: number | null;
    error?: string | null;
  }>;
}

interface EventDetail extends SerializedEvent {
  notificationMonitor?: NotificationMonitor[];
}

export default function AdminEventPage({ params }: { params: { id: string } }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [callers, setCallers] = useState<
    Array<{ id: string; displayName: string; username: string; role: string }>
  >([]);
  const [callerName, setCallerName] = useState("");
  const [linkUserId, setLinkUserId] = useState("");
  const [addMarch, setAddMarch] = useState("8:00");
  const [useMyAccount, setUseMyAccount] = useState(true);
  const [starting, setStarting] = useState(false);
  const [firstCallerLead, setFirstCallerLead] = useState("3");
  const [pushLeadMs, setPushLeadMs] = useState("1000");
  const [timingSaving, setTimingSaving] = useState(false);

  const { correctedNow, isLive } = useServerClock({
    activeRally: event?.status === "ACTIVE",
    useWebSocket: false,
  });

  const nextCaller = useNextCaller(event?.assignments, correctedNow, event?.status === "ACTIVE");
  const nextLaunchMs = nextCaller?.launchTime ? new Date(nextCaller.launchTime).getTime() : null;
  const { display: nextCountdown } = useCountdown(nextLaunchMs, correctedNow);

  const loadEvent = useCallback(() => {
    fetch(`/api/events/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return;
        setEvent(data);
        setFirstCallerLead(String(data.firstCallerLeadSeconds ?? 3));
        setPushLeadMs(String(data.pushLeadMs ?? 1000));
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
            (data.users || []).filter(
              (u: { role: string; active: boolean }) =>
                u.active && (u.role === "CALLER" || u.role === "ADMIN")
            )
          )
        );
    }
  }, [user, loadEvent]);

  useEffect(() => {
    if (event?.status !== "ACTIVE") return;
    const interval = setInterval(loadEvent, 2000);
    return () => clearInterval(interval);
  }, [event?.status, loadEvent]);

  const addCaller = async () => {
    if (!callerName.trim() || !addMarch) return;
    await fetch(`/api/events/${params.id}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callerName: callerName.trim(),
        userId: linkUserId || (useMyAccount && user ? user.id : undefined),
        marchDuration: addMarch,
      }),
    });
    setCallerName("");
    setLinkUserId("");
    loadEvent();
  };

  const removeCaller = async (assignmentId: string) => {
    await fetch(`/api/events/${params.id}/assignments/${assignmentId}`, { method: "DELETE" });
    loadEvent();
  };

  const goRally = async () => {
    setStarting(true);
    await fetch(`/api/events/${params.id}/start`, { method: "POST" });
    setStarting(false);
    loadEvent();
  };

  const restartRally = async () => {
    const msg =
      event?.status === "ACTIVE"
        ? "Restart this rally now? Countdowns will reset from the current server time."
        : "Run this template again now?";
    if (!confirm(msg)) return;
    await goRally();
  };

  const resetTemplate = async () => {
    if (!confirm("Reset this rally back to template? Launch times and notifications will be cleared.")) return;
    await fetch(`/api/events/${params.id}/reset`, { method: "POST" });
    loadEvent();
  };

  const saveTimingSettings = async () => {
    setTimingSaving(true);
    try {
      await fetch(`/api/events/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstCallerLeadSeconds: parseInt(firstCallerLead, 10),
          pushLeadMs: parseInt(pushLeadMs, 10),
        }),
      });
      loadEvent();
    } finally {
      setTimingSaving(false);
    }
  };

  const linkMyAccount = async (assignmentId: string) => {
    if (!user) return;
    await fetch(`/api/events/${params.id}/assignments/${assignmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });
    loadEvent();
  };

  const deleteRally = async (hard = false) => {
    const msg = hard
      ? "Permanently delete this template? This cannot be undone."
      : event?.status === "ACTIVE"
        ? "Stop this rally and cancel remaining notifications?"
        : "Delete this rally template?";
    if (!confirm(msg)) return;
    const url = hard ? `/api/events/${params.id}?hard=true` : `/api/events/${params.id}`;
    await fetch(url, { method: "DELETE" });
    router.push("/admin");
  };

  if (loading || !event) {
    return <div className="p-8 text-center text-rally-muted">Loading...</div>;
  }

  const canEdit = event.status === "DRAFT" || event.status === "READY";
  const isActive = event.status === "ACTIVE";
  const isFinished = event.status === "COMPLETED";
  const isTemplate = canEdit;
  const marchDuplicateGroups = getMarchDuplicateGroups(event.assignments);
  const addMarchSeconds = parseMarchDuration(addMarch);
  const matchingMarchCallers = addMarchSeconds
    ? event.assignments.filter((a) => a.marchDurationSeconds === addMarchSeconds)
    : [];
  const launchSlots = groupAssignmentsByLaunchSlot(event.assignments);
  const templateSlots = groupAssignmentsByLaunchSlot(
    event.assignments.map((a) => ({ ...a, launchTime: null }))
  );

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      <Link href="/admin" className="text-rally-muted text-sm hover:text-rally-accent">
        ← Templates
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-rally-muted text-sm">
          {isTemplate ? "TEMPLATE" : event.status}
          {event.isTestMode ? " · TEST" : ""}
        </p>
        <Link href={`/events/${event.id}`} className="text-rally-accent text-xs mt-1 inline-block">
          Public live view →
        </Link>
      </header>

      <ServerClock correctedNow={correctedNow} isLive={isLive} />

      <PushSetupCard onSubscribed={loadEvent} />

      {marchDuplicateGroups.length > 0 && (
        <MarchDuplicateNotice groups={marchDuplicateGroups} />
      )}

      <section className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg">
        <p className="text-rally-muted text-xs">GATHER</p>
        <p className="text-xl font-mono font-bold">{formatGather(event.gatherDurationSeconds)}</p>

        {isTemplate ? (
          <div className="mt-4 pt-4 border-t border-rally-border space-y-3">
            <p className="text-rally-muted text-xs">TIMING SETTINGS</p>
            <div>
              <label className="text-rally-muted text-xs block mb-1">
                FIRST CALLER LEAD (seconds after GO)
              </label>
              <input
                type="number"
                min={0}
                max={300}
                value={firstCallerLead}
                onChange={(e) => setFirstCallerLead(e.target.value)}
                className="w-full px-3 py-2 bg-rally-bg border border-rally-border rounded font-mono text-sm"
              />
              <p className="text-rally-muted text-xs mt-1">
                How long after GO before the first caller throws. Each caller only gets
                warnings that fit before their own launch time.
              </p>
            </div>
            <div>
              <label className="text-rally-muted text-xs block mb-1">
                PUSH DELIVERY LEAD (milliseconds)
              </label>
              <input
                type="number"
                min={0}
                max={5000}
                step={100}
                value={pushLeadMs}
                onChange={(e) => setPushLeadMs(e.target.value)}
                className="w-full px-3 py-2 bg-rally-bg border border-rally-border rounded font-mono text-sm"
              />
              <p className="text-rally-muted text-xs mt-1">
                Send notifications early to offset ~1s network delay. Check latency in Caller
                Push Status after a test rally and adjust if needed.
              </p>
            </div>
            <button
              onClick={saveTimingSettings}
              disabled={timingSaving}
              className="w-full py-2 bg-rally-accent text-white text-sm font-bold rounded disabled:opacity-50"
            >
              {timingSaving ? "SAVING..." : "SAVE TIMING"}
            </button>
          </div>
        ) : (
          <div className="mt-3 text-rally-muted text-xs space-y-1">
            <p>First caller lead: {event.firstCallerLeadSeconds ?? 3}s after GO</p>
            <p>Push delivery lead: {event.pushLeadMs ?? 1000}ms</p>
          </div>
        )}

        {!isTemplate && event.targetArrivalTime && (
          <>
            <p className="text-rally-muted text-xs mt-3">TARGET ARRIVAL</p>
            <p className="text-xl font-mono font-bold">{formatArrivalTime(event.targetArrivalTime)}</p>
          </>
        )}
        {isTemplate && (
          <p className="text-rally-muted text-sm mt-2">
            Launch times are calculated when you press GO. Longest-march caller throws first.
          </p>
        )}
      </section>

      {nextCaller && isActive && (
        <section className="p-4 mb-4 bg-rally-accent/20 border border-rally-accent rounded-lg text-center">
          <p className="text-rally-muted text-xs">NEXT CALLER</p>
          <p className="text-2xl font-bold">{nextCaller.displayName.toUpperCase()}</p>
          <p className="text-3xl font-mono font-bold text-rally-accent">{nextCountdown}</p>
        </section>
      )}

      {isActive && (
        <section className="flex flex-col gap-3 mb-6">
          {launchSlots.map((slot) => (
            <CallerCountdownRow
              key={slot.assignmentIds.join("-")}
              displayNames={slot.displayNames}
              marchFormatted={slot.marchFormatted}
              launchTime={slot.launchTime}
              status={slot.status}
              correctedNow={correctedNow}
              highlight={slot.assignmentIds.some((id) => nextCaller?.assignmentIds.includes(id))}
            />
          ))}
        </section>
      )}

      {isTemplate && (
        <section className="mb-4">
          <h2 className="text-rally-muted text-xs mb-2">TEMPLATE CALLERS</h2>
          <div className="flex flex-col gap-2 mb-4">
            {templateSlots.map((slot) => (
              <div
                key={slot.assignmentIds.join("-")}
                className="flex justify-between items-center p-3 bg-rally-surface border border-rally-border rounded-lg"
              >
                <div>
                  <p className="font-bold">{slot.displayNames.join(", ")}</p>
                  <p className="text-rally-muted text-xs font-mono">March {slot.marchFormatted}</p>
                  {slot.displayNames.length > 1 && (
                    <p className="text-rally-warning text-xs mt-0.5">Launch together</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {slot.assignmentIds.map((id) => {
                    const caller = event.assignments.find((a) => a.id === id);
                    if (!caller) return null;
                    return (
                      <button
                        key={id}
                        onClick={() => removeCaller(id)}
                        className="text-rally-danger text-xs"
                      >
                        Remove {caller.displayName}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-rally-surface border border-rally-border rounded-lg flex flex-col gap-2">
            <h3 className="text-rally-muted text-xs">ADD CALLER</h3>
            <input
              placeholder="Caller name (e.g. Alice)"
              value={callerName}
              onChange={(e) => setCallerName(e.target.value)}
              className="px-3 py-2 bg-rally-bg border border-rally-border rounded"
            />
            <input
              value={addMarch}
              onChange={(e) => setAddMarch(e.target.value)}
              placeholder="March (M:SS)"
              className="px-3 py-2 bg-rally-bg border border-rally-border rounded"
            />
            {matchingMarchCallers.length > 0 && (
              <p className="text-rally-warning text-xs">
                Same march as {matchingMarchCallers.map((a) => a.displayName).join(", ")} — they
                will launch together.
              </p>
            )}
            <select
              value={linkUserId}
              onChange={(e) => setLinkUserId(e.target.value)}
              className="px-3 py-2 bg-rally-bg border border-rally-border rounded text-rally-text"
            >
              <option value="">Link push account (optional)</option>
              {user && (
                <option value={user.id}>
                  Me ({user.displayName}) — recommended for testing
                </option>
              )}
              {callers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName} (@{c.username})
                  {c.role === "ADMIN" ? " — admin" : ""}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useMyAccount}
                onChange={(e) => setUseMyAccount(e.target.checked)}
              />
              Auto-link my account to new callers (for push testing)
            </label>
            <p className="text-rally-muted text-xs">
              Link a caller or admin account to send push notifications for that slot. Admins
              can run the rally and throw their own march when linked here.
            </p>
            <button onClick={addCaller} className="py-2 border border-rally-border rounded font-bold text-sm">
              ADD TO TEMPLATE
            </button>
          </div>
        </section>
      )}

      {!isTemplate && !isActive && (
        <section className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-rally-muted text-left text-xs">
                <th className="pb-2">Caller</th>
                <th className="pb-2">March</th>
                <th className="pb-2">Launch</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {event.assignments.map((a) => (
                <tr key={a.id} className="border-t border-rally-border">
                  <td className="py-2">{a.displayName}</td>
                  <td className="py-2 font-mono">{a.marchFormatted}</td>
                  <td className="py-2 font-mono">{formatArrivalTime(a.launchTime)}</td>
                  <td className="py-2 text-xs">{statusLabel(a.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(isActive || isFinished) && event.assignments.length > 0 && (
        <section className="flex flex-col gap-3 mb-4">
          <button
            onClick={restartRally}
            disabled={starting}
            className="w-full py-6 bg-rally-success text-white font-bold text-2xl rounded-xl disabled:opacity-50"
          >
            {starting ? "STARTING..." : isFinished ? "GO AGAIN" : "RESTART RALLY"}
          </button>
          <p className="text-rally-muted text-xs text-center -mt-1">
            Reruns this template immediately from the current server time.
          </p>
        </section>
      )}

      {isFinished && event.assignments.length > 0 && (
        <section className="flex flex-col gap-3 mb-4">
          <button
            onClick={resetTemplate}
            className="w-full py-4 bg-rally-accent/20 border border-rally-accent text-rally-accent font-bold rounded-lg"
          >
            START TEMPLATE AGAIN
          </button>
          <p className="text-rally-muted text-xs text-center -mt-1">
            Clears launch times so you can edit callers before pressing GO.
          </p>
        </section>
      )}

      {canEdit && event.assignments.length > 0 && (
        <button
          onClick={goRally}
          disabled={starting}
          className="w-full py-6 mb-4 bg-rally-success text-white font-bold text-2xl rounded-xl disabled:opacity-50"
        >
          {starting ? "STARTING..." : "GO"}
        </button>
      )}

      {canEdit && (
        <button
          onClick={() => deleteRally(false)}
          className="w-full py-3 mb-3 bg-rally-danger/20 border border-rally-danger text-rally-danger font-bold rounded-lg text-sm"
        >
          DELETE TEMPLATE
        </button>
      )}

      {(isActive || isFinished) && (
        <section className="flex flex-col gap-3 mb-6">
          {!isFinished && (
            <>
              <button
                onClick={resetTemplate}
                className="w-full py-4 bg-rally-warning/20 border border-rally-warning text-rally-warning font-bold rounded-lg"
              >
                RESET TO TEMPLATE
              </button>
              <p className="text-rally-muted text-xs text-center -mt-1">
                Clears launch times so you can edit callers and press GO again.
              </p>
            </>
          )}
          <button
            onClick={() => deleteRally(false)}
            className="w-full py-3 bg-rally-danger/20 border border-rally-danger text-rally-danger font-bold rounded-lg text-sm"
          >
            {isActive ? "STOP & DELETE RALLY" : "DELETE RALLY"}
          </button>
        </section>
      )}

      {event.notificationMonitor && (
        <section className="mb-8">
          <h2 className="text-rally-muted text-xs mb-2">CALLER PUSH STATUS</h2>
          <p className="text-rally-muted text-xs mb-3">
            Each caller must be linked to an account, and that account must enable notifications
            on their device. Use the section above to register this phone first.
          </p>
          {event.notificationMonitor.map((m) => (
            <div key={m.assignmentId} className="p-3 mb-2 bg-rally-surface border border-rally-border rounded-lg text-sm">
              <div className="flex justify-between items-start gap-2">
                <span className="font-bold">{m.callerName}</span>
                <span className={m.hasActiveDevice ? "text-rally-success" : "text-rally-muted"}>
                  {!m.hasPushAccount
                    ? "No account linked"
                    : m.hasActiveDevice
                      ? `✓ ${m.devices.map((d) => d.platform).join(", ")}`
                      : "Account linked, no device"}
                </span>
              </div>
              {!m.hasPushAccount && user && (
                <button
                  onClick={() => linkMyAccount(m.assignmentId)}
                  className="mt-2 text-rally-accent text-xs font-bold"
                >
                  Link my account ({user.displayName})
                </button>
              )}
              {m.hasPushAccount && !m.hasActiveDevice && (
                <p className="text-rally-warning text-xs mt-2">
                  Linked account has not enabled notifications on any device yet.
                </p>
              )}
              {m.notifications.length > 0 && (
                <div className="mt-2 pt-2 border-t border-rally-border space-y-1">
                  {m.notifications.map((n) => {
                    const isOverdue =
                      n.status === "PENDING" &&
                      n.scheduledAt &&
                      new Date(n.scheduledAt).getTime() < correctedNow() - 2000;
                    return (
                    <div key={n.type} className="flex justify-between text-xs gap-2">
                      <span className="text-rally-muted">
                        {n.type.replace("WARNING_", "")}
                        {n.type === "LAUNCH" ? "" : "s"}
                      </span>
                      <span
                        className={
                          n.status === "SENT"
                            ? "text-rally-success"
                            : n.status === "SKIPPED"
                              ? "text-rally-muted"
                              : n.status === "PENDING" && isOverdue
                                ? "text-rally-danger"
                                : n.status === "PENDING"
                                  ? "text-rally-warning"
                                  : "text-rally-danger"
                        }
                      >
                        {n.status === "SENT" && n.latencyMs != null
                          ? `sent (+${n.latencyMs}ms)`
                          : n.status === "SKIPPED"
                            ? n.error === "rally ended"
                              ? "skipped (rally ended)"
                              : "skipped"
                            : n.status === "PENDING" && isOverdue
                              ? "overdue"
                              : n.status.toLowerCase()}
                      </span>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
