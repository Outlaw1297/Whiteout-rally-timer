"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Pin, PinOff, Rocket, X } from "lucide-react";
import type { SerializedEvent } from "@/hooks/useEventSocket";
import { StatusBadge, statusToneForEvent } from "@/components/ui/StatusBadge";

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
        className={`p-3 rounded-xl border ${
          active
            ? "border-rally-ice/40 bg-rally-ice/10"
            : "border-rally-border bg-rally-bg"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/admin/events/${event.id}`}
            onClick={() => setOpen(false)}
            className="min-w-0 flex-1"
          >
            <p className="font-bold text-sm truncate text-rally-snow">{event.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusBadge tone={statusToneForEvent(event.status)}>{event.status}</StatusBadge>
              <span className="text-rally-muted text-xs">
                {event.assignments.length} caller
                {event.assignments.length !== 1 ? "s" : ""}
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => togglePin(event.id, !!event.pinned)}
            className={`btn-ghost !min-h-[32px] !py-1 !px-2 text-xs ${
              event.pinned ? "text-rally-warning" : "text-rally-muted"
            }`}
            title={event.pinned ? "Unpin" : "Pin"}
          >
            {event.pinned ? (
              <Pin className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <PinOff className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        </div>
        {(event.status === "READY" || event.status === "DRAFT" || event.status === "COMPLETED") &&
          event.assignments.length > 0 && (
            <button
              type="button"
              disabled={startingId === event.id}
              onClick={() => startOne(event.id)}
              className="btn-success mt-2 w-full !min-h-[36px] !py-2 text-xs gap-1"
            >
              <Rocket className="h-3.5 w-3.5" aria-hidden />
              {startingId === event.id ? "Starting..." : "GO"}
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
        className="fixed right-3 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-40 inline-flex items-center gap-2 rounded-full border border-rally-ice/40 bg-rally-surface px-4 py-3 text-sm font-semibold text-rally-ice shadow-panel hover:bg-rally-surface-2 transition-colors min-h-[48px]"
        aria-label="Open templates"
      >
        <LayoutGrid className="h-4 w-4" aria-hidden />
        Templates
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close templates"
            onClick={() => setOpen(false)}
          />
          <aside className="relative w-full max-w-sm h-full bg-rally-bg border-l border-rally-border p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-rally-ice">Quick Templates</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-ghost !min-h-[36px] !p-2"
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {loading && <p className="text-rally-muted text-sm">Loading…</p>}

            {!loading && templates.length === 0 && (
              <p className="text-rally-muted text-sm">No templates yet</p>
            )}

            {pinned.length > 0 && (
              <section className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rally-muted mb-2">
                  Pinned
                </p>
                <div className="flex flex-col gap-2">{pinned.map(renderRow)}</div>
              </section>
            )}

            {rest.length > 0 && (
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rally-muted mb-2">
                  All Templates
                </p>
                <div className="flex flex-col gap-2">{rest.map(renderRow)}</div>
              </section>
            )}

            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="mt-6 block text-center nav-link text-sm font-semibold justify-center"
            >
              Manage all templates →
            </Link>
          </aside>
        </div>
      )}
    </>
  );
}
