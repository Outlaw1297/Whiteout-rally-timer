"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { TemplateSwitcher } from "@/components/TemplateSwitcher";
import { HomeButton } from "@/components/HomeButton";
import { StatusBanner } from "@/components/StatusBanner";
import { formatArrivalTime, formatGather, statusLabel } from "@/lib/display";
import { formatMarchDuration, parseMarchDuration } from "@/lib/timing";
import {
  getMarchDuplicateGroups,
  groupAssignmentsByLaunchSlot,
} from "@/lib/march-groups";
import { isAdminRole } from "@/lib/roles";

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

const OFFSET_TOOLTIP =
  "Offset adjusts a rally from hitting at the same time. Example: call1 at +1 hits one second later than the calculated time; call2 at -1 hits one second earlier.";

function formatOffsetLabel(offset: number): string {
  if (offset > 0) return `· +${offset}s hit`;
  if (offset < 0) return `· ${offset}s hit`;
  return "· hit at target";
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
  const [addOffset, setAddOffset] = useState("0");
  const [starting, setStarting] = useState(false);
  const [firstCallerLead, setFirstCallerLead] = useState("3");
  const [timingSaving, setTimingSaving] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savingCallerId, setSavingCallerId] = useState<string | null>(null);
  const [quickAddingId, setQuickAddingId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<
    Record<string, { march: string; offset: string; userId: string; name: string }>
  >({});

  const { correctedNow } = useServerClock({
    activeRally: event?.status === "ACTIVE",
    useWebSocket: false,
  });

  const nextCaller = useNextCaller(event?.assignments, correctedNow, event?.status === "ACTIVE");
  const nextLaunchMs = nextCaller?.launchTime ? new Date(nextCaller.launchTime).getTime() : null;
  const { display: nextCountdown } = useCountdown(nextLaunchMs, correctedNow);

  const flash = (ok: string | null, err: string | null = null) => {
    setStatusMsg(ok);
    setErrorMsg(err);
    if (ok || err) {
      window.setTimeout(() => {
        setStatusMsg((cur) => (cur === ok ? null : cur));
        setErrorMsg((cur) => (cur === err ? null : cur));
      }, 4000);
    }
  };

  const syncDrafts = useCallback((data: EventDetail) => {
    const next: Record<string, { march: string; offset: string; userId: string; name: string }> =
      {};
    for (const a of data.assignments) {
      next[a.id] = {
        march: a.marchFormatted || formatMarchDuration(a.marchDurationSeconds),
        offset: String(a.arrivalOffsetSeconds ?? 0),
        userId: a.userId || "",
        name: a.displayName,
      };
    }
    setEditDrafts(next);
  }, []);

  const loadEvent = useCallback(() => {
    fetch(`/api/events/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return;
        setEvent(data);
        setFirstCallerLead(String(data.firstCallerLeadSeconds ?? 3));
        syncDrafts(data);
      });
  }, [params.id, syncDrafts]);

  useEventSocket({
    eventId: params.id,
    onEventUpdate: (e) => {
      setEvent((prev) => ({ ...prev, ...e }));
      if (e.status === "COMPLETED" || e.status === "CANCELLED") {
        loadEvent();
      }
    },
    onEventCancelled: () => loadEvent(),
  });

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && !isAdminRole(user.role)) router.push("/caller");
  }, [user, loading, router]);

  useEffect(() => {
    if (user && isAdminRole(user.role)) {
      loadEvent();
      fetch("/api/admin/users")
        .then((r) => r.json())
        .then((data) =>
          setCallers(
            (data.users || []).filter(
              (u: { role: string; active: boolean }) =>
                u.active &&
                (u.role === "CALLER" || u.role === "ADMIN" || u.role === "DEVELOPER")
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

  useEffect(() => {
    if (event?.status !== "COMPLETED") return;
    loadEvent();
    const interval = setInterval(loadEvent, 1500);
    const stop = setTimeout(() => clearInterval(interval), 12_000);
    return () => {
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [event?.status, event?.id, loadEvent]);

  const linkedUserIds = useMemo(
    () => new Set((event?.assignments || []).map((a) => a.userId).filter(Boolean)),
    [event?.assignments]
  );

  const quickAddCandidates = useMemo(
    () => callers.filter((c) => !linkedUserIds.has(c.id)),
    [callers, linkedUserIds]
  );

  const addCaller = async () => {
    if (!callerName.trim() || !addMarch) return;
    const offset = parseInt(addOffset, 10);
    const res = await fetch(`/api/events/${params.id}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callerName: callerName.trim(),
        userId: linkUserId || undefined,
        marchDuration: addMarch,
        arrivalOffsetSeconds: Number.isFinite(offset) ? offset : 0,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      flash(null, data.error || "Failed to add caller");
      return;
    }
    setCallerName("");
    setLinkUserId("");
    setAddOffset("0");
    flash("Caller added to template");
    loadEvent();
  };

  const quickAddCaller = async (c: {
    id: string;
    displayName: string;
    username: string;
  }) => {
    setQuickAddingId(c.id);
    try {
      const res = await fetch(`/api/events/${params.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callerName: c.displayName,
          userId: c.id,
          marchDuration: "8:00",
          arrivalOffsetSeconds: 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash(null, data.error || `Failed to add ${c.displayName}`);
        return;
      }
      flash(`Added ${c.displayName}`);
      loadEvent();
    } finally {
      setQuickAddingId(null);
    }
  };

  const saveCallerEdits = async (assignmentId: string) => {
    const draft = editDrafts[assignmentId];
    if (!draft) return;
    const offset = parseInt(draft.offset, 10);
    if (!Number.isFinite(offset) || offset < -3600 || offset > 3600) {
      flash(null, "Offset must be between -3600 and 3600");
      return;
    }
    if (!parseMarchDuration(draft.march)) {
      flash(null, "Invalid march duration (use M:SS)");
      return;
    }
    setSavingCallerId(assignmentId);
    try {
      const res = await fetch(`/api/events/${params.id}/assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callerName: draft.name.trim(),
          marchDuration: draft.march,
          arrivalOffsetSeconds: offset,
          userId: draft.userId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash(null, data.error || "Failed to save caller");
        return;
      }
      flash("Caller saved");
      loadEvent();
    } finally {
      setSavingCallerId(null);
    }
  };

  const cloneTemplate = async () => {
    setCloning(true);
    try {
      const res = await fetch(`/api/events/${params.id}/clone`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.id) router.push(`/admin/events/${data.id}`);
      else flash(null, data.error || "Clone failed");
    } finally {
      setCloning(false);
    }
  };

  const removeCaller = async (assignmentId: string) => {
    const res = await fetch(`/api/events/${params.id}/assignments/${assignmentId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      flash(null, data.error || "Failed to remove caller");
      return;
    }
    flash("Caller removed");
    loadEvent();
  };

  const goRally = async () => {
    setStarting(true);
    try {
      const res = await fetch(`/api/events/${params.id}/start`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash(null, data.error || "Failed to start rally");
        return;
      }
      flash("Rally started");
      loadEvent();
    } finally {
      setStarting(false);
    }
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
    if (!confirm("Reset this rally back to template? Launch times and notifications will be cleared."))
      return;
    const res = await fetch(`/api/events/${params.id}/reset`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      flash(null, data.error || "Reset failed");
      return;
    }
    flash("Template reset");
    loadEvent();
  };

  const saveTimingSettings = async () => {
    setTimingSaving(true);
    try {
      const res = await fetch(`/api/events/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstCallerLeadSeconds: parseInt(firstCallerLead, 10),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash(null, data.error || "Failed to save timing");
        return;
      }
      flash("Timing settings saved");
      loadEvent();
    } finally {
      setTimingSaving(false);
    }
  };

  const linkMyAccount = async (assignmentId: string) => {
    if (!user) return;
    const res = await fetch(`/api/events/${params.id}/assignments/${assignmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      flash(null, data.error || "Failed to link account");
      return;
    }
    flash("Account linked");
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

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      <TemplateSwitcher currentEventId={event.id} onChanged={loadEvent} />

      <div className="flex items-center justify-between gap-3">
        <Link href="/admin" className="text-rally-muted text-sm hover:text-rally-accent">
          ← Templates
        </Link>
        <HomeButton />
      </div>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-rally-muted text-sm">
          {isTemplate ? "TEMPLATE" : event.status}
          {event.isTestMode ? " · TEST" : ""}
          {event.pinned ? " · PINNED" : ""}
        </p>
        <div className="flex flex-wrap gap-3 mt-1">
          <Link href={`/events/${event.id}`} className="text-rally-accent text-xs">
            Public live view →
          </Link>
          <button
            type="button"
            onClick={cloneTemplate}
            disabled={cloning}
            className="text-rally-muted text-xs hover:text-rally-accent"
          >
            {cloning ? "Cloning…" : "Clone template"}
          </button>
        </div>
      </header>

      <StatusBanner
        success={statusMsg}
        error={errorMsg}
        onDismiss={() => {
          setStatusMsg(null);
          setErrorMsg(null);
        }}
      />

      <PushSetupCard onSubscribed={loadEvent} />

      {marchDuplicateGroups.length > 0 && (
        <MarchDuplicateNotice groups={marchDuplicateGroups} />
      )}

      <section className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg">
        <p className="text-rally-muted text-xs">RALLY TIME</p>
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
                warnings that fit before their own launch time. Push delivery lead is learned
                per device automatically.
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
            <p>Push delivery lead: per-device (learned automatically)</p>
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
            Launch times are calculated when you press GO. Use arrival offsets to stagger hit
            order (0 = at target, positive = later, negative = earlier).
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
            {event.assignments.map((caller) => {
              const sameMarch = event.assignments.filter(
                (a) =>
                  a.id !== caller.id &&
                  a.marchDurationSeconds === caller.marchDurationSeconds &&
                  (a.arrivalOffsetSeconds ?? 0) === (caller.arrivalOffsetSeconds ?? 0)
              );
              const offset = caller.arrivalOffsetSeconds ?? 0;
              const draft = editDrafts[caller.id] || {
                march: caller.marchFormatted,
                offset: String(offset),
                userId: caller.userId || "",
                name: caller.displayName,
              };
              return (
                <div
                  key={caller.id}
                  className="p-3 bg-rally-surface border border-rally-border rounded-lg space-y-2"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <input
                        value={draft.name}
                        onChange={(e) =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [caller.id]: { ...draft, name: e.target.value },
                          }))
                        }
                        className="w-full px-2 py-1 bg-rally-bg border border-rally-border rounded font-bold text-sm"
                        aria-label={`Caller name for ${caller.displayName}`}
                      />
                      <p className="text-rally-muted text-xs font-mono mt-0.5">
                        March {caller.marchFormatted} {formatOffsetLabel(offset)}
                      </p>
                      {sameMarch.length > 0 && (
                        <p className="text-rally-warning text-xs mt-0.5">
                          Same march/offset as {sameMarch.map((a) => a.displayName).join(", ")} —
                          launch together
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => removeCaller(caller.id)}
                      className="text-rally-danger text-xs shrink-0"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-rally-muted text-xs block">
                      March (M:SS)
                      <input
                        value={draft.march}
                        onChange={(e) =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [caller.id]: { ...draft, march: e.target.value },
                          }))
                        }
                        className="w-full mt-1 px-2 py-1 bg-rally-bg border border-rally-border rounded font-mono text-sm"
                      />
                    </label>
                    <label className="text-rally-muted text-xs block" title={OFFSET_TOOLTIP}>
                      Offset (s)
                      <span className="ml-1 text-rally-accent cursor-help" title={OFFSET_TOOLTIP}>
                        ⓘ
                      </span>
                      <input
                        type="number"
                        min={-3600}
                        max={3600}
                        value={draft.offset}
                        onChange={(e) =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [caller.id]: { ...draft, offset: e.target.value },
                          }))
                        }
                        className="w-full mt-1 px-2 py-1 bg-rally-bg border border-rally-border rounded font-mono text-sm"
                        aria-label={`Arrival offset for ${caller.displayName}`}
                      />
                    </label>
                  </div>
                  <p className="text-rally-muted text-[11px] leading-snug">{OFFSET_TOOLTIP}</p>

                  <label className="text-rally-muted text-xs block">
                    Linked account
                    <select
                      value={draft.userId}
                      onChange={(e) =>
                        setEditDrafts((prev) => ({
                          ...prev,
                          [caller.id]: { ...draft, userId: e.target.value },
                        }))
                      }
                      className="w-full mt-1 px-2 py-1 bg-rally-bg border border-rally-border rounded text-sm text-rally-text"
                    >
                      <option value="">None (name only)</option>
                      {user && (
                        <option value={user.id}>Me ({user.displayName})</option>
                      )}
                      {callers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.displayName} (@{c.username})
                          {c.role === "ADMIN"
                            ? " — admin"
                            : c.role === "DEVELOPER"
                              ? " — developer"
                              : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() => saveCallerEdits(caller.id)}
                    disabled={savingCallerId === caller.id}
                    className="w-full py-2 bg-rally-accent text-white text-xs font-bold rounded disabled:opacity-50"
                  >
                    {savingCallerId === caller.id ? "SAVING..." : "SAVE CALLER"}
                  </button>
                </div>
              );
            })}
          </div>

          {quickAddCandidates.length > 0 && (
            <div className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg">
              <h3 className="text-rally-muted text-xs mb-2">QUICK ADD REGISTERED</h3>
              <p className="text-rally-muted text-xs mb-3">
                One-tap add for accounts already registered. Use Add Caller below for new
                unregistered names.
              </p>
              <div className="flex flex-col gap-2">
                {quickAddCandidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={quickAddingId === c.id}
                    onClick={() => quickAddCaller(c)}
                    className="flex items-center justify-between px-3 py-2 border border-rally-border rounded text-sm hover:border-rally-accent disabled:opacity-50"
                  >
                    <span>
                      {c.displayName}{" "}
                      <span className="text-rally-muted text-xs">@{c.username}</span>
                    </span>
                    <span className="text-rally-accent text-xs font-bold">
                      {quickAddingId === c.id ? "…" : "+ ADD"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 bg-rally-surface border border-rally-border rounded-lg flex flex-col gap-2">
            <h3 className="text-rally-muted text-xs">ADD CALLER</h3>
            <p className="text-rally-muted text-xs">
              For new callers who have not registered yet. Registered accounts: use Quick Add
              above.
            </p>
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
            <div>
              <label className="text-rally-muted text-xs" title={OFFSET_TOOLTIP}>
                ARRIVAL OFFSET (seconds){" "}
                <span className="text-rally-accent cursor-help" title={OFFSET_TOOLTIP}>
                  ⓘ
                </span>
              </label>
              <input
                type="number"
                min={-3600}
                max={3600}
                value={addOffset}
                onChange={(e) => setAddOffset(e.target.value)}
                className="w-full px-3 py-2 bg-rally-bg border border-rally-border rounded font-mono"
              />
              <p className="text-rally-muted text-xs mt-1">{OFFSET_TOOLTIP}</p>
            </div>
            {matchingMarchCallers.length > 0 && (
              <p className="text-rally-warning text-xs">
                Same march as {matchingMarchCallers.map((a) => a.displayName).join(", ")} — they
                will launch together if offsets also match.
              </p>
            )}
            <select
              value={linkUserId}
              onChange={(e) => setLinkUserId(e.target.value)}
              className="px-3 py-2 bg-rally-bg border border-rally-border rounded text-rally-text"
            >
              <option value="">Link push account (optional)</option>
              {user && (
                <option value={user.id}>Me ({user.displayName})</option>
              )}
              {callers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName} (@{c.username})
                  {c.role === "ADMIN"
                    ? " — admin"
                    : c.role === "DEVELOPER"
                      ? " — developer"
                      : ""}
                </option>
              ))}
            </select>
            <p className="text-rally-muted text-xs">
              Link a caller, admin, or developer account to send push notifications for that
              slot.
            </p>
            <button
              onClick={addCaller}
              className="py-2 border border-rally-border rounded font-bold text-sm"
            >
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
            <div
              key={m.assignmentId}
              className="p-3 mb-2 bg-rally-surface border border-rally-border rounded-lg text-sm"
            >
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
                          {n.type === "RALLY_STARTED"
                            ? "Started"
                            : n.type === "LAUNCH"
                              ? "Throw"
                              : n.type.replace("WARNING_", "") + "s"}
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
                            ? `sent (${n.latencyMs >= 0 ? "+" : ""}${n.latencyMs}ms)`
                            : n.status === "SKIPPED"
                              ? n.error === "rally ended" || n.error === "last caller launched"
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
