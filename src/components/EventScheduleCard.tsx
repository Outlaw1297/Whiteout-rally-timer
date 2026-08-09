"use client";

import Link from "next/link";
import { formatArrivalTime, formatGather, statusLabel } from "@/lib/display";
import type { SerializedEvent } from "@/hooks/useEventSocket";

export function EventScheduleCard({ event }: { event: SerializedEvent }) {
  const isTemplate = event.isTemplate || event.status === "READY" || event.status === "DRAFT";

  return (
    <article className="p-4 bg-rally-surface border border-rally-border rounded-lg">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h2 className="font-bold text-lg">{event.name}</h2>
          <p className="text-rally-muted text-xs mt-0.5">
            {isTemplate ? "TEMPLATE · waiting for GO" : event.status}
          </p>
        </div>
        <Link
          href={`/events/${event.id}`}
          className="text-rally-accent text-xs font-bold hover:underline"
        >
          {event.status === "ACTIVE" ? "Live →" : "Details →"}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm mb-4">
        <div>
          <p className="text-rally-muted text-xs">
            {isTemplate ? "ARRIVAL" : "TARGET ARRIVAL"}
          </p>
          <p className="font-mono font-bold">
            {isTemplate ? "On GO" : formatArrivalTime(event.targetArrivalTime)}
          </p>
        </div>
        <div>
          <p className="text-rally-muted text-xs">GATHER</p>
          <p className="font-mono">{formatGather(event.gatherDurationSeconds)}</p>
        </div>
      </div>

      {event.assignments.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-rally-muted text-left text-xs">
                <th className="pb-1">Caller</th>
                <th className="pb-1">March</th>
                {!isTemplate && <th className="pb-1">Launch</th>}
                <th className="pb-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {event.assignments.map((a) => (
                <tr key={a.id} className="border-t border-rally-border">
                  <td className="py-1.5 font-medium">{a.displayName}</td>
                  <td className="py-1.5 font-mono">{a.marchFormatted}</td>
                  {!isTemplate && (
                    <td className="py-1.5 font-mono">{formatArrivalTime(a.launchTime)}</td>
                  )}
                  <td className="py-1.5 text-xs">{statusLabel(a.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isTemplate && event.targetArrivalTime && (
        <p className="text-rally-muted text-xs mt-3">
          All arrive: {formatArrivalTime(event.targetArrivalTime)}
        </p>
      )}
    </article>
  );
}
