"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  ExternalLink,
  Info,
  Plus,
  Rocket,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useServerClock } from "@/hooks/useServerClock";
import { useCountdown } from "@/hooks/useCountdown";
import { useEventSocket, type SerializedEvent } from "@/hooks/useEventSocket";
import { useNextCaller } from "@/hooks/useNextCaller";
import { CallerCountdownRow } from "@/components/CallerCountdownRow";
import { MarchDuplicateNotice } from "@/components/MarchDuplicateNotice";
import { PushSetupCard } from "@/components/PushSetupCard";
import { TemplateSwitcher } from "@/components/TemplateSwitcher";
import { AdminNav } from "@/components/AdminNav";
import { StatusBanner } from "@/components/StatusBanner";
import { AppShell, Panel, SectionLabel } from "@/components/ui/AppShell";
import {
  StatusBadge,
  statusToneForAssignment,
  statusToneForEvent,
} from "@/components/ui/StatusBadge";
import { formatArrivalTime, formatGather, statusLabel } from "@/lib/display";
import { formatMarchDuration, parseMarchDuration } from "@/lib/timing";
import {
  getMarchDuplicateGroups,
  groupAssignmentsByLaunchSlot,
  type MarchAssignment,
} from "@/lib/march-groups";
import {
  mergeCallerEditDrafts,
  type CallerEditDraft,
} from "@/lib/caller-edit-drafts";
import { HitOrderPreview } from "@/components/HitOrderPreview";
import { RallyTimeline } from "@/components/RallyTimeline";
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

function notificationStatusTone(
  status: string,
  isOverdue: boolean
): "success" | "warning" | "danger" | "neutral" {
  if (status === "SENT") return "success";
  if (status === "SKIPPED") return "neutral";
  if (status === "PENDING" && isOverdue) return "danger";
  if (status === "PENDING") return "warning";
  return "danger";
}

export default function AdminEventPage({ params }: { params: { id: string } }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [callers, setCallers] = useState<
    Array<{
      id: string;
      displayName: string;
      username: string;
      role: string;
      online?: boolean;
      lastSeenAt?: string | null;
    }>
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
  const [editDrafts, setEditDrafts] = useState<Record<string, CallerEditDraft>>({});
  /** Assignment ids with unsaved local edits — polls must not clobber these. */
  const dirtyCallerIdsRef = useRef<Set<string>>(new Set());
  const timingDirtyRef = useRef(false);

  const { correctedNow } = useServerClock({
    activeRally: event?.status === "ACTIVE",
    useWebSocket: false,
  });

  const nextCaller = useNextCaller(event?.assignments, correctedNow, event?.status === "ACTIVE");
  const nextLaunchMs = nextCaller?.launchTime ? new Date(nextCaller.launchTime).getTime() : null;
  const { display: nextCountdown, isNow: nextIsNow } = useCountdown(nextLaunchMs, correctedNow);

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

  const markCallerDirty = (assignmentId: string) => {
    dirtyCallerIdsRef.current.add(assignmentId);
  };

  const clearCallerDirty = (assignmentId: string) => {
    dirtyCallerIdsRef.current.delete(assignmentId);
  };

  const syncDrafts = useCallback((data: EventDetail) => {
    const serverDrafts: Record<string, CallerEditDraft> = {};
    for (const a of data.assignments) {
      serverDrafts[a.id] = {
        march: a.marchFormatted || formatMarchDuration(a.marchDurationSeconds),
        offset: String(a.arrivalOffsetSeconds ?? 0),
        userId: a.userId || "",
        name: a.displayName,
      };
    }
    setEditDrafts((prev) =>
      mergeCallerEditDrafts(prev, serverDrafts, dirtyCallerIdsRef.current)
    );
  }, []);

  const loadEvent = useCallback(() => {
    fetch(`/api/events/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return;
        setEvent(data);
        if (!timingDirtyRef.current) {
          setFirstCallerLead(String(data.firstCallerLeadSeconds ?? 3));
        }
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

  const loadCallers = useCallback(() => {
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
  }, []);

  useEffect(() => {
    if (user && isAdminRole(user.role)) {
      loadEvent();
      loadCallers();
    }
  }, [user, loadEvent, loadCallers]);

  // Keep linked-account online badges fresh while editing a template.
  useEffect(() => {
    if (!user || !isAdminRole(user.role)) return;
    if (event?.status !== "READY" && event?.status !== "DRAFT") return;
    const interval = setInterval(loadCallers, 15_000);
    return () => clearInterval(interval);
  }, [user, event?.status, loadCallers]);

  useEffect(() => {
    if (event?.status !== "ACTIVE") return;
    const interval = setInterval(loadEvent, 2000);
    return () => clearInterval(interval);
  }, [event?.status, loadEvent]);

  // Templates: poll so caller march edits appear quickly even if a WS frame is missed.
  useEffect(() => {
    if (event?.status !== "READY" && event?.status !== "DRAFT") return;
    const interval = setInterval(loadEvent, 3000);
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

  const callerById = useMemo(() => {
    const map = new Map(callers.map((c) => [c.id, c]));
    return map;
  }, [callers]);

  const presenceForUser = (userId: string | null | undefined) => {
    if (!userId) return null;
    const linked = callerById.get(userId);
    if (!linked) return null;
    return { online: !!linked.online, name: linked.displayName };
  };

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
      clearCallerDirty(assignmentId);
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
      timingDirtyRef.current = false;
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

  if (loading || !event || !user) {
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

  const previewAssignments: MarchAssignment[] = event.assignments.map((a) => {
    const draft = editDrafts[a.id];
    const marchSeconds = draft?.march
      ? parseMarchDuration(draft.march) ?? a.marchDurationSeconds
      : a.marchDurationSeconds;
    const offset = draft?.offset != null ? parseInt(draft.offset, 10) : a.arrivalOffsetSeconds ?? 0;
    return {
      id: a.id,
      displayName: draft?.name?.trim() || a.displayName,
      marchDurationSeconds: marchSeconds,
      marchFormatted:
        draft?.march && parseMarchDuration(draft.march) != null
          ? draft.march
          : a.marchFormatted,
      arrivalOffsetSeconds: Number.isFinite(offset) ? offset : a.arrivalOffsetSeconds ?? 0,
    };
  });
  const previewLead = parseInt(firstCallerLead, 10);
  const previewLeadSeconds = Number.isFinite(previewLead)
    ? Math.max(0, previewLead)
    : event.firstCallerLeadSeconds ?? 3;

  return (
    <AppShell wide className="page-enter">
      <TemplateSwitcher currentEventId={event.id} onChanged={loadEvent} />

      <AdminNav displayName={user.displayName} role={user.role} onLogout={logout} />

      <header className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-rally-snow">{event.name}</h1>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <StatusBadge tone={isTemplate ? "warning" : statusToneForEvent(event.status)}>
                {isTemplate ? "Template" : event.status}
              </StatusBadge>
              {event.isTestMode && <StatusBadge tone="info">Test</StatusBadge>}
              {event.pinned && <StatusBadge tone="warning">Pinned</StatusBadge>}
              {isActive && (
                <StatusBadge tone="live" pulse>
                  Live
                </StatusBadge>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-2">
          <Link
            href={`/events/${event.id}`}
            className="nav-link text-xs gap-1"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Public live view
          </Link>
          <button
            type="button"
            onClick={cloneTemplate}
            disabled={cloning}
            className="nav-link text-xs gap-1"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
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

      <Panel className="mb-4">
        <SectionLabel>Rally Time</SectionLabel>
        <p className="timer-display text-xl text-rally-ice mt-1">
          {formatGather(event.gatherDurationSeconds)}
        </p>

        {isTemplate ? (
          <div className="mt-4 pt-4 border-t border-rally-border space-y-3">
            <SectionLabel>Timing Settings</SectionLabel>
            <div>
              <label className="label-field">
                First Caller Lead (seconds after GO)
              </label>
              <input
                type="number"
                min={0}
                max={300}
                value={firstCallerLead}
                onChange={(e) => {
                  timingDirtyRef.current = true;
                  setFirstCallerLead(e.target.value);
                }}
                className="input-field font-mono text-sm"
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
              className="btn-primary w-full !min-h-[40px] text-sm"
            >
              {timingSaving ? "Saving..." : "Save Timing"}
            </button>
          </div>
        ) : (
          <div className="mt-3 text-rally-muted text-xs space-y-1">
            <p>First caller lead: {event.firstCallerLeadSeconds ?? 3}s after GO</p>
            <p>Push delivery lead: per-device (learned automatically)</p>
          </div>
        )}

        {!isTemplate && event.targetArrivalTime && (
          <div className="mt-3">
            <SectionLabel>Target Arrival</SectionLabel>
            <p className="timer-display text-xl text-rally-ice mt-1">
              {formatArrivalTime(event.targetArrivalTime)}
            </p>
          </div>
        )}
        {isTemplate && (
          <p className="text-rally-muted text-sm mt-2">
            Launch times are calculated when you press GO. Use arrival offsets to stagger hit
            order (0 = at target, positive = later, negative = earlier).
          </p>
        )}
      </Panel>

      {nextCaller && isActive && (
        <Panel launch={nextIsNow} accent={!nextIsNow} className="mb-4 text-center !p-5">
          <SectionLabel>Next Up</SectionLabel>
          <p className="text-2xl font-bold text-rally-snow mt-1 tracking-wide uppercase">
            {nextCaller.displayName}
          </p>
          {nextIsNow ? (
            <p className="mt-2 text-4xl font-black uppercase tracking-tight text-rally-launch">
              Launch Now
            </p>
          ) : (
            <p className="timer-display text-4xl text-rally-ice mt-2">{nextCountdown}</p>
          )}
        </Panel>
      )}

      {isActive && launchSlots.length > 0 && (
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

      {isTemplate && event.assignments.length > 0 && (
        <HitOrderPreview
          assignments={previewAssignments}
          firstCallerLeadSeconds={previewLeadSeconds}
        />
      )}

      {isTemplate && (
        <section className="mb-4">
          <SectionLabel>Template Callers</SectionLabel>
          <div className="flex flex-col gap-2 mb-4 mt-2">
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
              const linkedPresence = presenceForUser(draft.userId || caller.userId);
              return (
                <Panel key={caller.id} className="space-y-2">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <input
                        value={draft.name}
                        onChange={(e) => {
                          markCallerDirty(caller.id);
                          setEditDrafts((prev) => ({
                            ...prev,
                            [caller.id]: { ...draft, name: e.target.value },
                          }));
                        }}
                        className="input-field !min-h-[40px] !py-2 font-semibold text-sm"
                        aria-label={`Caller name for ${caller.displayName}`}
                      />
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <p className="text-rally-muted text-xs font-mono">
                          March {caller.marchFormatted} {formatOffsetLabel(offset)}
                        </p>
                        {linkedPresence && (
                          <StatusBadge
                            tone={linkedPresence.online ? "live" : "neutral"}
                            pulse={linkedPresence.online}
                          >
                            {linkedPresence.online ? "Online" : "Offline"}
                          </StatusBadge>
                        )}
                      </div>
                      {sameMarch.length > 0 && (
                        <p className="text-rally-warning text-xs mt-0.5">
                          Same march/offset as {sameMarch.map((a) => a.displayName).join(", ")} —
                          launch together
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => removeCaller(caller.id)}
                      className="btn-ghost !min-h-[32px] text-rally-danger text-xs gap-1 shrink-0"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="label-field block">
                      March (M:SS)
                      <input
                        value={draft.march}
                        onChange={(e) => {
                          markCallerDirty(caller.id);
                          setEditDrafts((prev) => ({
                            ...prev,
                            [caller.id]: { ...draft, march: e.target.value },
                          }));
                        }}
                        className="input-field !min-h-[40px] !py-2 font-mono text-sm mt-1"
                      />
                    </label>
                    <label className="label-field block" title={OFFSET_TOOLTIP}>
                      <span className="inline-flex items-center gap-1">
                        Offset (s)
                        <Info className="h-3 w-3 text-rally-ice cursor-help" aria-hidden />
                      </span>
                      <input
                        type="number"
                        min={-3600}
                        max={3600}
                        value={draft.offset}
                        onChange={(e) => {
                          markCallerDirty(caller.id);
                          setEditDrafts((prev) => ({
                            ...prev,
                            [caller.id]: { ...draft, offset: e.target.value },
                          }));
                        }}
                        className="input-field !min-h-[40px] !py-2 font-mono text-sm mt-1"
                        aria-label={`Arrival offset for ${caller.displayName}`}
                      />
                    </label>
                  </div>
                  <p className="text-rally-muted text-[11px] leading-snug">{OFFSET_TOOLTIP}</p>

                  <label className="label-field block">
                    Linked account
                    <select
                      value={draft.userId}
                      onChange={(e) => {
                        markCallerDirty(caller.id);
                        setEditDrafts((prev) => ({
                          ...prev,
                          [caller.id]: { ...draft, userId: e.target.value },
                        }));
                      }}
                      className="input-field !min-h-[40px] !py-2 text-sm mt-1"
                    >
                      <option value="">None (name only)</option>
                      {user && (
                        <option value={user.id}>
                          Me ({user.displayName})
                          {callerById.has(user.id)
                            ? callerById.get(user.id)?.online
                              ? " · online"
                              : " · offline"
                            : ""}
                        </option>
                      )}
                      {callers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.displayName} (@{c.username})
                          {c.role === "ADMIN"
                            ? " — admin"
                            : c.role === "DEVELOPER"
                              ? " — developer"
                              : ""}
                          {c.online ? " · online" : " · offline"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(() => {
                    const presence = presenceForUser(draft.userId);
                    if (!presence) return null;
                    return (
                      <div className="flex items-center gap-2 -mt-1">
                        <StatusBadge tone={presence.online ? "live" : "neutral"} pulse={presence.online}>
                          {presence.online ? "Online" : "Offline"}
                        </StatusBadge>
                        <span className="text-rally-muted text-[11px]">{presence.name}</span>
                      </div>
                    );
                  })()}

                  <button
                    type="button"
                    onClick={() => saveCallerEdits(caller.id)}
                    disabled={savingCallerId === caller.id}
                    className="btn-primary w-full !min-h-[40px] text-xs"
                  >
                    {savingCallerId === caller.id ? "Saving..." : "Save Caller"}
                  </button>
                </Panel>
              );
            })}
          </div>

          {quickAddCandidates.length > 0 && (
            <Panel className="mb-4">
              <SectionLabel>Quick Add Registered</SectionLabel>
              <p className="text-rally-muted text-xs mb-3 mt-1">
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
                    className="btn-secondary !justify-between !min-h-[40px] text-sm disabled:opacity-50"
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className="truncate">
                        {c.displayName}{" "}
                        <span className="text-rally-muted text-xs">@{c.username}</span>
                      </span>
                      <StatusBadge tone={c.online ? "live" : "neutral"} pulse={!!c.online}>
                        {c.online ? "Online" : "Offline"}
                      </StatusBadge>
                    </span>
                    <span className="text-rally-ice text-xs font-semibold inline-flex items-center gap-1 shrink-0">
                      <Plus className="h-3 w-3" aria-hidden />
                      {quickAddingId === c.id ? "…" : "Add"}
                    </span>
                  </button>
                ))}
              </div>
            </Panel>
          )}

          <Panel className="flex flex-col gap-2">
            <SectionLabel>Add Caller</SectionLabel>
            <p className="text-rally-muted text-xs mt-1">
              For new callers who have not registered yet. Registered accounts: use Quick Add
              above.
            </p>
            <input
              placeholder="Caller name (e.g. Alice)"
              value={callerName}
              onChange={(e) => setCallerName(e.target.value)}
              className="input-field"
            />
            <input
              value={addMarch}
              onChange={(e) => setAddMarch(e.target.value)}
              placeholder="March (M:SS)"
              className="input-field font-mono"
            />
            <div>
              <label className="label-field inline-flex items-center gap-1" title={OFFSET_TOOLTIP}>
                Arrival Offset (seconds)
                <Info className="h-3 w-3 text-rally-ice cursor-help" aria-hidden />
              </label>
              <input
                type="number"
                min={-3600}
                max={3600}
                value={addOffset}
                onChange={(e) => setAddOffset(e.target.value)}
                className="input-field font-mono"
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
              className="input-field"
            >
              <option value="">Link push account (optional)</option>
              {user && (
                <option value={user.id}>
                  Me ({user.displayName})
                  {callerById.has(user.id)
                    ? callerById.get(user.id)?.online
                      ? " · online"
                      : " · offline"
                    : ""}
                </option>
              )}
              {callers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName} (@{c.username})
                  {c.role === "ADMIN"
                    ? " — admin"
                    : c.role === "DEVELOPER"
                      ? " — developer"
                      : ""}
                  {c.online ? " · online" : " · offline"}
                </option>
              ))}
            </select>
            {(() => {
              const presence = presenceForUser(linkUserId);
              if (!presence) return null;
              return (
                <div className="flex items-center gap-2">
                  <StatusBadge tone={presence.online ? "live" : "neutral"} pulse={presence.online}>
                    {presence.online ? "Online" : "Offline"}
                  </StatusBadge>
                  <span className="text-rally-muted text-[11px]">{presence.name}</span>
                </div>
              );
            })()}
            <p className="text-rally-muted text-xs">
              Link a caller, admin, or developer account to send push notifications for that
              slot.
            </p>
            <button onClick={addCaller} className="btn-secondary font-semibold text-sm">
              Add to Template
            </button>
          </Panel>
        </section>
      )}

      {!isTemplate && !isActive && (
        <Panel className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-rally-muted text-left text-xs border-b border-rally-border">
                <th className="pb-2 font-semibold">Caller</th>
                <th className="pb-2 font-semibold">March</th>
                <th className="pb-2 font-semibold">Launch</th>
                <th className="pb-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {event.assignments.map((a) => (
                <tr key={a.id} className="border-t border-rally-border">
                  <td className="py-2 text-rally-snow">{a.displayName}</td>
                  <td className="py-2 font-mono text-rally-ice">{a.marchFormatted}</td>
                  <td className="py-2 font-mono">{formatArrivalTime(a.launchTime)}</td>
                  <td className="py-2">
                    <StatusBadge tone={statusToneForAssignment(a.status)}>
                      {statusLabel(a.status)}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {(isActive || isFinished) && event.assignments.length > 0 && (
        <section className="flex flex-col gap-3 mb-4">
          <button
            onClick={restartRally}
            disabled={starting}
            className="btn-success w-full !py-6 !text-2xl !font-bold rounded-xl disabled:opacity-50"
          >
            <Rocket className="h-6 w-6" aria-hidden />
            {starting ? "Starting..." : isFinished ? "Go Again" : "Restart Rally"}
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
            className="btn-secondary w-full !py-4 !border-rally-ice/50 !text-rally-ice font-bold"
          >
            Start Template Again
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
          className="btn-success w-full !py-6 mb-4 !text-3xl !font-bold rounded-xl disabled:opacity-50 motion-safe:animate-launch-pulse"
        >
          <Rocket className="h-7 w-7" aria-hidden />
          {starting ? "Starting..." : "GO"}
        </button>
      )}

      {canEdit && (
        <button
          onClick={() => deleteRally(false)}
          className="btn-danger w-full !py-3 mb-3 !bg-rally-danger/15 !border !border-rally-danger/50 !text-rally-danger text-sm"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete Template
        </button>
      )}

      {(isActive || isFinished) && (
        <section className="flex flex-col gap-3 mb-6">
          {!isFinished && (
            <>
              <button
                onClick={resetTemplate}
                className="btn-secondary w-full !py-4 !border-rally-warning/50 !text-rally-warning font-bold"
              >
                Reset to Template
              </button>
              <p className="text-rally-muted text-xs text-center -mt-1">
                Clears launch times so you can edit callers and press GO again.
              </p>
            </>
          )}
          <button
            onClick={() => deleteRally(false)}
            className="btn-danger w-full !py-3 !bg-rally-danger/15 !border !border-rally-danger/50 !text-rally-danger text-sm"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {isActive ? "Stop & Delete Rally" : "Delete Rally"}
          </button>
        </section>
      )}

      {event.notificationMonitor && (
        <section className="mb-8">
          <SectionLabel>Caller Push Status</SectionLabel>
          <p className="text-rally-muted text-xs mb-3 mt-1">
            Each caller must be linked to an account, and that account must enable notifications
            on their device. Use the section above to register this phone first.
          </p>
          {event.notificationMonitor.map((m) => {
            const assignment = event.assignments.find((a) => a.id === m.assignmentId);
            const presence = presenceForUser(assignment?.userId);
            return (
            <Panel key={m.assignmentId} className="mb-2 !p-3 text-sm">
              <div className="flex justify-between items-start gap-2">
                <span className="font-bold text-rally-snow inline-flex items-center gap-2 flex-wrap">
                  {m.callerName}
                  {presence && (
                    <StatusBadge tone={presence.online ? "live" : "neutral"} pulse={presence.online}>
                      {presence.online ? "Online" : "Offline"}
                    </StatusBadge>
                  )}
                </span>
                <StatusBadge
                  tone={
                    !m.hasPushAccount
                      ? "neutral"
                      : m.hasActiveDevice
                        ? "success"
                        : "warning"
                  }
                >
                  {!m.hasPushAccount
                    ? "No account linked"
                    : m.hasActiveDevice
                      ? m.devices.map((d) => d.platform).join(", ")
                      : "Account linked, no device"}
                </StatusBadge>
              </div>
              {!m.hasPushAccount && user && (
                <button
                  onClick={() => linkMyAccount(m.assignmentId)}
                  className="btn-ghost text-xs font-semibold text-rally-ice mt-2 !px-0"
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
                    const isOverdue = Boolean(
                      n.status === "PENDING" &&
                      n.scheduledAt &&
                      new Date(n.scheduledAt).getTime() < correctedNow() - 2000
                    );
                    return (
                      <div key={n.type} className="flex justify-between text-xs gap-2 items-center">
                        <span className="text-rally-muted">
                          {n.type === "RALLY_STARTED"
                            ? "Started"
                            : n.type === "LAUNCH"
                              ? "Throw"
                              : n.type.replace("WARNING_", "") + "s"}
                        </span>
                        <StatusBadge tone={notificationStatusTone(n.status, isOverdue)}>
                          {n.status === "SENT" && n.latencyMs != null
                            ? `sent (${n.latencyMs >= 0 ? "+" : ""}${n.latencyMs}ms)`
                            : n.status === "SKIPPED"
                              ? n.error === "rally ended" || n.error === "last caller launched"
                                ? "skipped (rally ended)"
                                : "skipped"
                              : n.status === "PENDING" && isOverdue
                                ? "overdue"
                                : n.status.toLowerCase()}
                        </StatusBadge>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
            );
          })}
        </section>
      )}
    </AppShell>
  );
}
