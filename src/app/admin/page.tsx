"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { formatGather } from "@/lib/display";
import { PushSetupCard } from "@/components/PushSetupCard";
import { RolesNote } from "@/components/RolesNote";
import { TemplateSwitcher } from "@/components/TemplateSwitcher";
import { HomeButton } from "@/components/HomeButton";
import { NotificationPreferences } from "@/components/NotificationPreferences";
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
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      <TemplateSwitcher onChanged={loadEvents} />

      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-rally-accent">ADMIN</h1>
          <p className="text-rally-muted text-sm">{user.displayName}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <HomeButton />
          <Link href="/admin/users" className="text-rally-muted text-sm hover:text-rally-accent">
            Users
          </Link>
          {(user.role === "DEVELOPER") && (
            <Link
              href="/admin/developer"
              className="text-rally-muted text-sm hover:text-rally-accent"
            >
              Developer
            </Link>
          )}
          <button onClick={logout} className="text-rally-muted text-sm hover:text-rally-danger">
            Logout
          </button>
        </div>
      </header>

      <RolesNote compact />

      <PushSetupCard />

      <NotificationPreferences />

      <button
        onClick={() => setShowCreate(!showCreate)}
        className="w-full py-4 mb-4 bg-rally-accent text-white font-bold rounded-lg"
      >
        {showCreate ? "CANCEL" : "+ NEW RALLY TEMPLATE"}
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
        <section className="p-3 mb-4 bg-rally-surface border border-rally-border rounded-lg space-y-2">
          <p className="text-rally-muted text-xs font-bold">START MULTIPLE TEMPLATES</p>
          <p className="text-rally-muted text-xs">
            Check templates below, then start them together. Optional stagger delays each GO.
          </p>
          <div className="flex items-center gap-2">
            <label className="text-rally-muted text-xs shrink-0">Stagger (s)</label>
            <input
              type="number"
              min={0}
              max={600}
              value={staggerSeconds}
              onChange={(e) => setStaggerSeconds(e.target.value)}
              className="w-20 px-2 py-1 bg-rally-bg border border-rally-border rounded font-mono text-sm"
            />
            <button
              type="button"
              onClick={startSelected}
              disabled={startingMany || selected.size === 0}
              className="flex-1 py-2 bg-rally-success text-white text-sm font-bold rounded disabled:opacity-50"
            >
              {startingMany
                ? "STARTING..."
                : `START ${selected.size || ""} SELECTED`.trim()}
            </button>
          </div>
          {batchError && <p className="text-rally-danger text-xs">{batchError}</p>}
        </section>
      )}

      <section className="flex flex-col gap-4">
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
            <div
              key={event.id}
              className="p-4 bg-rally-surface border border-rally-border rounded-lg"
            >
              <div className="flex justify-between items-start gap-2">
                {canSelect && (
                  <input
                    type="checkbox"
                    checked={selected.has(event.id)}
                    onChange={() => toggleSelect(event.id)}
                    className="mt-1.5"
                    aria-label={`Select ${event.name}`}
                  />
                )}
                <Link href={`/admin/events/${event.id}`} className="flex-1 min-w-0">
                  <h2 className="font-bold text-lg">
                    {event.pinned ? "★ " : ""}
                    {event.name}
                  </h2>
                  <span className="text-xs text-rally-muted">{event.status}</span>
                  <p className="text-rally-muted text-sm mt-1">
                    Rally time: {formatGather(event.gatherDurationSeconds)} ·{" "}
                    {event.assignments.length} caller
                    {event.assignments.length !== 1 ? "s" : ""}
                  </p>
                  {event.status === "READY" && (
                    <p className="text-rally-warning text-xs font-bold mt-2">Ready — tap to GO</p>
                  )}
                  {event.status === "ACTIVE" && (
                    <p className="text-rally-success text-xs font-bold mt-2">● LIVE</p>
                  )}
                  {event.status === "COMPLETED" && (
                    <p className="text-rally-muted text-xs font-bold mt-2">
                      Last caller thrown — reset to run again
                    </p>
                  )}
                </Link>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => togglePin(event.id, !!event.pinned)}
                    className="text-rally-warning text-xs font-bold px-2 py-1 border border-rally-border rounded"
                  >
                    {event.pinned ? "Unpin" : "Pin"}
                  </button>
                  {(event.status === "ACTIVE" || event.status === "COMPLETED") && (
                    <button
                      onClick={() => resetEvent(event.id)}
                      className="text-rally-warning text-xs font-bold px-2 py-1 border border-rally-warning rounded"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    onClick={() => deleteEvent(event.id, event.status)}
                    className="text-rally-danger text-xs font-bold px-2 py-1 border border-rally-danger rounded"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </main>
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
    <form
      onSubmit={handleSubmit}
      className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg flex flex-col gap-3"
    >
      <button
        type="button"
        onClick={handleTestMode}
        className="text-rally-warning text-sm font-bold text-left"
      >
        ⚡ Quick test template (10s rally time)
      </button>

      <input
        placeholder="Rally Name (e.g. Bear Trap)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="px-3 py-2 bg-rally-bg border border-rally-border rounded text-rally-text"
        required
      />
      <div>
        <label className="text-rally-muted text-xs">RALLY TIME (M:SS)</label>
        <input
          value={gather}
          onChange={(e) => setGather(e.target.value)}
          className="w-full px-3 py-2 bg-rally-bg border border-rally-border rounded text-rally-text"
        />
      </div>

      <p className="text-rally-muted text-xs">
        Add callers and march times on the next screen. Press GO when ready — launch times
        are calculated from that moment.
      </p>

      {error && <p className="text-rally-danger text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="py-3 bg-rally-success text-white font-bold rounded-lg disabled:opacity-50"
      >
        {loading ? "CREATING..." : "CREATE TEMPLATE"}
      </button>
    </form>
  );
}
