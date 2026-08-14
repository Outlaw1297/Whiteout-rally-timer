"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useEventSocket, type SerializedEvent } from "@/hooks/useEventSocket";
import { Panel, SectionLabel } from "@/components/ui/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { parseMarchDuration } from "@/lib/timing";
import { isAdminRole } from "@/lib/roles";

/**
 * Compact editor for the signed-in user's linked march on a template.
 * Used on admin home (and anywhere else that needs march-only editing).
 * Local typing is preserved across poll/WS refreshes until Save.
 */
export function OwnMarchEditor({
  eventId,
  adminEventHref,
}: {
  eventId: string;
  /** Optional link to open the full template (admin). */
  adminEventHref?: string;
}) {
  const { user } = useAuth();
  const [event, setEvent] = useState<SerializedEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marchDraft, setMarchDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const assignment = event?.assignments.find((a) => a.userId === user?.id) ?? null;
  const canEdit = event?.status === "DRAFT" || event?.status === "READY";

  const applyServerMarch = useCallback((data: SerializedEvent) => {
    const mine = data.assignments?.find((a) => a.userId === user?.id);
    if (!mine?.marchFormatted) return;
    if (!dirtyRef.current) setMarchDraft(mine.marchFormatted);
  }, [user?.id]);

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
        applyServerMarch(data);
      })
      .catch(() => setError("Could not load rally"));
  }, [eventId, applyServerMarch]);

  useEventSocket({
    eventId,
    onEventUpdate: (e) => {
      setEvent(e);
      applyServerMarch(e);
    },
  });

  useEffect(() => {
    if (user) loadEvent();
  }, [user, loadEvent]);

  const saveMarch = async () => {
    if (!assignment || !event) return;
    if (!parseMarchDuration(marchDraft)) {
      setStatusError("Invalid march (use M:SS)");
      setStatusMsg(null);
      return;
    }
    setSaving(true);
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
      dirtyRef.current = false;
      setStatusMsg("March time saved");
      setStatusError(null);
      if (data.assignments) {
        setEvent(data);
        applyServerMarch(data);
      } else {
        loadEvent();
      }
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <Panel className="mb-4">
        <p className="text-rally-danger text-sm">{error}</p>
      </Panel>
    );
  }

  if (!event || !assignment || !user) {
    return null;
  }

  const href =
    adminEventHref ||
    (user && isAdminRole(user.role) ? `/admin/events/${event.id}` : undefined);

  return (
    <Panel className="mb-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>Your march</SectionLabel>
          <p className="text-sm font-semibold text-rally-snow truncate mt-0.5">{event.name}</p>
          <p className="text-rally-muted text-xs mt-0.5">
            Linked as {assignment.displayName}
          </p>
        </div>
        <StatusBadge tone={event.status === "ACTIVE" ? "live" : "neutral"}>
          {event.status}
        </StatusBadge>
      </div>

      {canEdit ? (
        <div className="space-y-2">
          <label className="label-field block">
            March (M:SS)
            <input
              value={marchDraft}
              onChange={(e) => {
                dirtyRef.current = true;
                setMarchDraft(e.target.value);
              }}
              placeholder="M:SS"
              className="input-field !min-h-[40px] !py-2 font-mono text-sm mt-1"
              aria-label="Your march time"
            />
          </label>
          <button
            type="button"
            onClick={saveMarch}
            disabled={saving}
            className="btn-primary w-full !py-2 !min-h-[40px] text-sm"
          >
            {saving ? "Saving…" : "Save march"}
          </button>
          <p className="text-rally-muted text-[11px] leading-snug">
            Edits stay while you type — save when ready. Other callers poll every few seconds.
          </p>
        </div>
      ) : (
        <p className="timer-display text-xl text-rally-snow">{assignment.marchFormatted}</p>
      )}

      {(statusMsg || statusError) && (
        <p
          className={`text-xs ${statusError ? "text-rally-danger" : "text-rally-success"}`}
          role="status"
        >
          {statusError || statusMsg}
        </p>
      )}

      {href && (
        <Link href={href} className="nav-link text-xs font-semibold">
          Open template →
        </Link>
      )}
    </Panel>
  );
}
