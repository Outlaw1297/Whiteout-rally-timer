"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pin, PinOff, RotateCcw, Trash2, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { formatGather } from "@/lib/display";
import { PushSetupCard } from "@/components/PushSetupCard";
import { RolesNote } from "@/components/RolesNote";
import { TemplateSwitcher } from "@/components/TemplateSwitcher";
import { AdminNav } from "@/components/AdminNav";
import { NotificationPreferences } from "@/components/NotificationPreferences";
import { AppShell, Panel, SectionLabel } from "@/components/ui/AppShell";
import { StatusBadge, statusToneForEvent } from "@/components/ui/StatusBadge";
import type { SerializedEvent } from "@/hooks/useEventSocket";

export default function AdminDashboard() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<SerializedEvent[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [startingMany, setStartingMany] = useState(false);
  const [staggerSeconds, setStaggerSeconds] = useState("0");
  const [batchError, setBatchError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && user.role !== "ADMIN" && user.role !== "DEVELOPER") {
      router.push("/caller");
    }
  }, [user, loading, router]);

  const loadEvents = () => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((data) => setEvents(data.events || []));
  };

  useEffect(() => {
    if (user?.role === "ADMIN" || user?.role === "DEVELOPER") loadEvents();
  }, [user]);

  const deleteEvent = async (id: string, status: string) => {
    const msg =
      status === "ACTIVE"
        ? "Stop this live rally and delete it?"
        : "Delete this rally template?";
    if (!confirm(msg)) return;
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    loadEvents();
  };

  const resetEvent = async (id: string) => {
    if (!confirm("Reset back to template? Launch times will be cleared.")) return;
    await fetch(`/api/events/${id}/reset`, { method: "POST" });
    loadEvents();
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectable = events.filter(
    (e) =>
      (e.status === "READY" || e.status === "DRAFT" || e.status === "COMPLETED") &&
      e.assignments.length > 0
  );

  const startSelected = async () => {
    setBatchError("");
    if (selected.size === 0) {
      setBatchError("Select at least one template");
      return;
    }
    setStartingMany(true);
    try {
      const res = await fetch("/api/events/start-many", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventIds: Array.from(selected),
          staggerSeconds: parseInt(staggerSeconds, 10) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBatchError(data.error || "Failed to start selected rallies");
        return;
      }
      setSelected(new Set());
      loadEvents();
      const firstOk = (data.results || []).find((r: { ok: boolean; id: string }) => r.ok);
      if (firstOk) router.push(`/admin/events/${firstOk.id}`);
    } finally {
      setStartingMany(false);
    }
  };

  const togglePin = async (id: string, pinned: boolean) => {
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !pinned }),
    });
    loadEvents();
  };

  if (loading || !user) {
    return <div className="p-8 text-center text-rally-muted">Loading...</div>;
  }

  return (
    <AppShell wide className="page-enter">
      <TemplateSwitcher onChanged={loadEvents} />

      <AdminNav displayName={user.displayName} role={user.role} onLogout={logout} />

      <RolesNote compact />

      <button
        onClick={() => setShowCreate(!showCreate)}
        className={showCreate ? "btn-secondary w-full mb-4" : "btn-primary w-full mb-4"}
      >
        {showCreate ? (
          "Cancel"
        ) : (
          <>
            <Plus className="h-4 w-4" aria-hidden />
            New Rally Template
          </>
        )}
      </button>

      {showCreate && (
        <CreateTemplateForm
          onCreated={(id) => {
            setShowCreate(false);
            loadEvents();
            router.push(`/admin/events/${id}`);
          }}
        />
      )}

      {selectable.length > 0 && (
        <Panel className="mb-4 space-y-3">
          <SectionLabel>Start Multiple Templates</SectionLabel>
          <p className="text-rally-muted text-xs">
            Check templates below, then start them together. Optional stagger delays each GO.
          </p>
          <div className="flex items-center gap-2">
            <label className="label-field shrink-0">Stagger (s)</label>
            <input
              type="number"
              min={0}
              max={600}
              value={staggerSeconds}
              onChange={(e) => setStaggerSeconds(e.target.value)}
              className="input-field w-20 !min-h-[40px] !py-2 font-mono text-sm"
            />
            <button
              type="button"
              onClick={startSelected}
              disabled={startingMany || selected.size === 0}
              className="btn-success flex-1 !min-h-[40px] !py-2 text-sm"
            >
              {startingMany
                ? "Starting..."
                : `Start ${selected.size || ""} Selected`.trim()}
            </button>
          </div>
          {batchError && <p className="text-rally-danger text-xs">{batchError}</p>}
        </Panel>
      )}

      <section className="flex flex-col gap-3">
        {events.length === 0 && (
          <p className="text-rally-muted text-center py-8">No rally templates yet</p>
        )}
        {events.map((event) => {
          const canSelect =
            (event.status === "READY" ||
              event.status === "DRAFT" ||
              event.status === "COMPLETED") &&
            event.assignments.length > 0;
          return (
            <Panel key={event.id}>
              <div className="flex justify-between items-start gap-2">
                {canSelect && (
                  <input
                    type="checkbox"
                    checked={selected.has(event.id)}
                    onChange={() => toggleSelect(event.id)}
                    className="mt-1.5 accent-rally-ice"
                    aria-label={`Select ${event.name}`}
                  />
                )}
                <Link href={`/admin/events/${event.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-lg text-rally-snow">{event.name}</h2>
                    {event.pinned && (
                      <Pin className="h-3.5 w-3.5 text-rally-warning shrink-0" aria-hidden />
                    )}
                    <StatusBadge tone={statusToneForEvent(event.status)}>
                      {event.status}
                    </StatusBadge>
                  </div>
                  <p className="text-rally-muted text-sm mt-1">
                    Rally time: {formatGather(event.gatherDurationSeconds)} ·{" "}
                    {event.assignments.length} caller
                    {event.assignments.length !== 1 ? "s" : ""}
                  </p>
                  {event.status === "READY" && (
                    <p className="text-rally-warning text-xs font-semibold mt-2">
                      Ready — tap to GO
                    </p>
                  )}
                  {event.status === "ACTIVE" && (
                    <StatusBadge tone="live" pulse className="mt-2">
                      Live
                    </StatusBadge>
                  )}
                  {event.status === "COMPLETED" && (
                    <p className="text-rally-muted text-xs mt-2">
                      Last caller thrown — reset to run again
                    </p>
                  )}
                </Link>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => togglePin(event.id, !!event.pinned)}
                    className="btn-ghost !min-h-[32px] !py-1 !px-2 text-xs text-rally-warning gap-1"
                  >
                    {event.pinned ? (
                      <>
                        <PinOff className="h-3 w-3" aria-hidden />
                        Unpin
                      </>
                    ) : (
                      <>
                        <Pin className="h-3 w-3" aria-hidden />
                        Pin
                      </>
                    )}
                  </button>
                  {(event.status === "ACTIVE" || event.status === "COMPLETED") && (
                    <button
                      onClick={() => resetEvent(event.id)}
                      className="btn-ghost !min-h-[32px] !py-1 !px-2 text-xs text-rally-warning gap-1"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden />
                      Reset
                    </button>
                  )}
                  <button
                    onClick={() => deleteEvent(event.id, event.status)}
                    className="btn-ghost !min-h-[32px] !py-1 !px-2 text-xs text-rally-danger gap-1"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                    Delete
                  </button>
                </div>
              </div>
            </Panel>
          );
        })}
      </section>

      <div className="mt-8 space-y-4">
        <SectionLabel>Notifications</SectionLabel>
        <PushSetupCard />
        <NotificationPreferences />
      </div>
    </AppShell>
  );
}

function CreateTemplateForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [gather, setGather] = useState("5:00");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const parseGather = (input: string): number | null => {
    const match = input.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  };

  const handleTestMode = () => {
    setName("TEST RALLY");
    setGather("0:10");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const gatherSeconds = parseGather(gather);
    if (!gatherSeconds) {
      setError("Invalid rally time (use M:SS)");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        gatherDurationSeconds: gatherSeconds,
        isTestMode: name === "TEST RALLY",
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to create");
      setLoading(false);
      return;
    }

    onCreated(data.id);
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4 flex flex-col gap-3">
      <Panel className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleTestMode}
          className="btn-ghost !justify-start text-rally-warning text-sm font-semibold gap-2"
        >
          <Zap className="h-4 w-4" aria-hidden />
          Quick test template (10s rally time)
        </button>

        <input
          placeholder="Rally Name (e.g. Bear Trap)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field"
          required
        />
        <div>
          <label className="label-field">Rally Time (M:SS)</label>
          <input
            value={gather}
            onChange={(e) => setGather(e.target.value)}
            className="input-field font-mono"
          />
        </div>

        <p className="text-rally-muted text-xs">
          Add callers and march times on the next screen. Press GO when ready — launch times
          are calculated from that moment.
        </p>

        {error && <p className="text-rally-danger text-sm">{error}</p>}

        <button type="submit" disabled={loading} className="btn-success">
          {loading ? "Creating..." : "Create Template"}
        </button>
      </Panel>
    </form>
  );
}
