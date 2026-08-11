"use client";

import { formatArrivalTime } from "@/lib/display";

export type TimelineSlot = {
  id: string;
  displayNames: string[];
  marchFormatted: string;
  launchTime: string | null;
  status: string;
  highlight?: boolean;
  isNow?: boolean;
};

/**
 * Visual timeline: callers launch at different times, arrive together.
 * Vertical on mobile, horizontal on md+.
 */
export function RallyTimeline({
  slots,
  targetArrivalTime,
}: {
  slots: TimelineSlot[];
  targetArrivalTime?: string | null;
}) {
  if (slots.length === 0) return null;

  const withTimes = slots.filter((s) => s.launchTime);
  const ordered = [...withTimes].sort(
    (a, b) => new Date(a.launchTime!).getTime() - new Date(b.launchTime!).getTime()
  );
  const displaySlots = ordered.length > 0 ? ordered : slots;

  return (
    <section className="mb-5 rounded-xl border border-rally-border bg-rally-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rally-muted mb-1">
        Rally timeline
      </p>
      <p className="text-rally-muted text-xs mb-4">
        Different launch times → everyone arrives together
        {targetArrivalTime ? (
          <>
            {" "}
            at{" "}
            <span className="font-mono font-semibold text-rally-snow">
              {formatArrivalTime(targetArrivalTime)}
            </span>
          </>
        ) : null}
      </p>

      {/* Mobile: vertical */}
      <ol className="flex flex-col gap-0 md:hidden relative pl-3">
        <span
          className="absolute left-[7px] top-2 bottom-2 w-px bg-rally-border"
          aria-hidden
        />
        {displaySlots.map((slot) => (
          <li key={slot.id} className="relative pl-5 py-2.5">
            <span
              className={`absolute left-0 top-4 h-3.5 w-3.5 rounded-full border-2 ${
                slot.isNow
                  ? "border-rally-launch bg-rally-launch"
                  : slot.highlight
                    ? "border-rally-ice bg-rally-ice"
                    : "border-rally-border bg-rally-surface-2"
              }`}
              aria-hidden
            />
            <div className="flex items-baseline justify-between gap-2">
              <p
                className={`font-semibold text-sm truncate ${
                  slot.isNow ? "text-rally-launch" : "text-rally-snow"
                }`}
              >
                {slot.displayNames.join(", ")}
              </p>
              <p className="timer-display text-xs text-rally-ice shrink-0">
                {slot.launchTime ? formatArrivalTime(slot.launchTime) : "On GO"}
              </p>
            </div>
            <p className="text-rally-muted text-[11px] font-mono mt-0.5">
              March {slot.marchFormatted}
            </p>
          </li>
        ))}
        {targetArrivalTime && (
          <li className="relative pl-5 py-2.5">
            <span
              className="absolute left-0 top-4 h-3.5 w-3.5 rounded-full border-2 border-rally-success bg-rally-success"
              aria-hidden
            />
            <p className="font-semibold text-sm text-rally-success">All arrive</p>
            <p className="timer-display text-xs text-rally-snow mt-0.5">
              {formatArrivalTime(targetArrivalTime)}
            </p>
          </li>
        )}
      </ol>

      {/* Desktop: horizontal */}
      <ol className="hidden md:flex items-stretch gap-0 overflow-x-auto pb-1">
        {displaySlots.map((slot, i) => (
          <li
            key={slot.id}
            className="flex items-stretch min-w-[140px] flex-1"
          >
            <div className="flex flex-col items-center text-center px-2 w-full">
              <div
                className={`h-3 w-3 rounded-full border-2 mb-2 ${
                  slot.isNow
                    ? "border-rally-launch bg-rally-launch"
                    : slot.highlight
                      ? "border-rally-ice bg-rally-ice"
                      : "border-rally-border bg-rally-surface-2"
                }`}
              />
              <p
                className={`font-semibold text-sm leading-tight ${
                  slot.isNow ? "text-rally-launch" : "text-rally-snow"
                }`}
              >
                {slot.displayNames.join(", ")}
              </p>
              <p className="timer-display text-xs text-rally-ice mt-1">
                {slot.launchTime ? formatArrivalTime(slot.launchTime) : "On GO"}
              </p>
              <p className="text-rally-muted text-[11px] font-mono mt-0.5">
                M {slot.marchFormatted}
              </p>
            </div>
            {i < displaySlots.length - 1 || targetArrivalTime ? (
              <div className="flex items-start pt-1.5" aria-hidden>
                <div className="h-px w-4 bg-rally-border mt-[5px]" />
              </div>
            ) : null}
          </li>
        ))}
        {targetArrivalTime && (
          <li className="flex flex-col items-center text-center px-2 min-w-[120px]">
            <div className="h-3 w-3 rounded-full border-2 border-rally-success bg-rally-success mb-2" />
            <p className="font-semibold text-sm text-rally-success">Arrive</p>
            <p className="timer-display text-xs text-rally-snow mt-1">
              {formatArrivalTime(targetArrivalTime)}
            </p>
          </li>
        )}
      </ol>
    </section>
  );
}
