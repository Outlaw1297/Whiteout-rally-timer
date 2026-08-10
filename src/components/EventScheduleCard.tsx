"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatArrivalTime, formatGather, statusLabel } from "@/lib/display";
import type { SerializedEvent } from "@/hooks/useEventSocket";
import { StatusBadge, statusToneForEvent } from "@/components/ui/StatusBadge";
import { SectionLabel } from "@/components/ui/AppShell";

export function EventScheduleCard({ event }: { event: SerializedEvent }) {
  const isTemplate = event.isTemplate || event.status === "READY" || event.status === "DRAFT";

  return (
    <article className="rounded-xl border border-rally-border bg-rally-surface p-4 page-enter">
      <div className="flex justify-between items-start gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="font-bold text-lg text-rally-snow truncate">{event.name}</h2>
          <div className="mt-1.5">
            <StatusBadge tone={isTemplate ? "warning" : statusToneForEvent(event.status)}>
              {isTemplate ? "Template · waiting for GO" : event.status}
            </StatusBadge>
          </div>
        </div>
        <Link
          href={`/events/${event.id}`}
          className="btn-secondary !px-3 !py-2 !min-h-[40px] text-xs shrink-0"
        >
          {event.status === "ACTIVE" ? "Live" : "Details"}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm mb-4">
        <div>
          <SectionLabel>{isTemplate ? "Arrival" : "Target arrival"}</SectionLabel>
          <p className="timer-display font-semibold text-rally-snow mt-1">
            {isTemplate ? "On GO" : formatArrivalTime(event.targetArrivalTime)}
          </p>
        </div>
        <div>
          <SectionLabel>Rally time</SectionLabel>
          <p className="timer-display mt-1">{formatGather(event.gatherDurationSeconds)}</p>
        </div>
      </div>

      {event.assignments.length > 0 && (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-rally-muted text-left text-[11px] uppercase tracking-wide">
                <th className="pb-2 font-semibold">Caller</th>
                <th className="pb-2 font-semibold">March</th>
                {!isTemplate && <th className="pb-2 font-semibold">Launch</th>}
                <th className="pb-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {event.assignments.map((a) => (
                <tr key={a.id} className="border-t border-rally-border/80">
                  <td className="py-2 font-medium text-rally-snow">{a.displayName}</td>
                  <td className="py-2 font-mono">{a.marchFormatted}</td>
                  {!isTemplate && (
                    <td className="py-2 font-mono">{formatArrivalTime(a.launchTime)}</td>
                  )}
                  <td className="py-2 text-xs text-rally-muted">{statusLabel(a.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isTemplate && event.targetArrivalTime && (
        <p className="text-rally-muted text-xs mt-3 font-mono">
          All arrive: {formatArrivalTime(event.targetArrivalTime)}
        </p>
      )}
    </article>
  );
}
