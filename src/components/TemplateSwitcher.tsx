"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SerializedEvent } from "@/hooks/useEventSocket";

interface TemplateSwitcherProps {
  currentEventId?: string;
  onChanged?: () => void;
}

export function TemplateSwitcher({ currentEventId, onChanged }: TemplateSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<SerializedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      setEvents(data.events || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const templates = events.filter(
    (e) => e.status === "DRAFT" || e.status === "READY" || e.status === "COMPLETED"
  );
  const pinned = templates.filter((e) => e.pinned);
  const rest = templates.filter((e) => !e.pinned);

  const togglePin = async (id: string, pinnedNow: boolean) => {
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !pinnedNow }),
    });
    load();
    onChanged?.();
  };

  const startOne = async (id: string) => {
    setStartingId(id);
    try {
      await fetch(`/api/events/${id}/start`, { method: "POST" });
      setOpen(false);
      onChanged?.();
      if (!pathname?.includes(id)) {
        router.push(`/admin/events/${id}`);
      } else {
        router.refresh();
      }
    } finally {
      setStartingId(null);
    }
  };

  const renderRow = (event: SerializedEvent) => {
    const active = event.id === currentEventId;
    return (
      <div
        key={event.id}
        className={`p-3 rounded-lg border ${
          active ? "border-rally-accent bg-rally-accent/10" : "border-rally-border bg-rally-bg"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/admin/events/${event.id}`}
            onClick={() => setOpen(false)}
            className="min-w-0 flex-1"
          >
            <p className="font-bold text-sm truncate">{event.name}</p>
            <p className="text-rally-muted text-xs mt-0.5">
              {event.status} · {event.assignments.length} caller
              {event.assignments.length !== 1 ? "s" : ""}
            </p>
          </Link>
          <button
            type="button"
            onClick={() => togglePin(event.id, !!event.pinned)}
            className={`text-xs px-2 py-1 rounded ${
              event.pinned ? "text-rally-warning" : "text-rally-muted"
            }`}
            title={event.pinned ? "Unpin" : "Pin"}
          >
            {event.pinned ? "★" : "☆"}
          </button>
        </div>
        {(event.status === "READY" || event.status === "DRAFT" || event.status === "COMPLETED") &&
          event.assignments.length > 0 && (
            <button
              type="button"
              disabled={startingId === event.id}
              onClick={() => startOne(event.id)}
              className="mt-2 w-full py-2 text-xs font-bold rounded bg-rally-success/20 border border-rally-success text-rally-success disabled:opacity-50"
            >
              {startingId === event.id ? "STARTING..." : "GO"}
            </button>
          )}
      </div>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-0 top-1/3 z-40 writing-mode-vertical px-2 py-4 bg-rally-surface border border-r-0 border-rally-border rounded-l-lg text-rally-accent text-xs font-bold shadow-lg"
        style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        aria-label="Open templates"
      >
        TEMPLATES
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close templates"
            onClick={() => setOpen(false)}
          />
          <aside className="relative w-full max-w-sm h-full bg-rally-bg border-l border-rally-border p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-rally-accent">Quick Templates</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-rally-muted text-sm"
              >
                Close
              </button>
            </div>

            {loading && <p className="text-rally-muted text-sm">Loading…</p>}

            {!loading && templates.length === 0 && (
              <p className="text-rally-muted text-sm">No templates yet</p>
            )}

            {pinned.length > 0 && (
              <section className="mb-4">
                <p className="text-rally-muted text-xs mb-2">PINNED</p>
                <div className="flex flex-col gap-2">{pinned.map(renderRow)}</div>
              </section>
            )}

            {rest.length > 0 && (
              <section>
                <p className="text-rally-muted text-xs mb-2">ALL TEMPLATES</p>
                <div className="flex flex-col gap-2">{rest.map(renderRow)}</div>
              </section>
            )}

            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="mt-6 block text-center text-rally-accent text-sm font-bold"
            >
              Manage all templates →
            </Link>
          </aside>
        </div>
      )}
    </>
  );
}
