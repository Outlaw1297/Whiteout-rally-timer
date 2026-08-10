"use client";

import {
  formatHitOffsetLabel,
  getHitOrderPreview,
  getThrowOrderPreview,
  type MarchAssignment,
} from "@/lib/march-groups";

export function HitOrderPreview({
  assignments,
  firstCallerLeadSeconds = 3,
}: {
  assignments: MarchAssignment[];
  firstCallerLeadSeconds?: number;
}) {
  if (assignments.length === 0) return null;

  const hitWaves = getHitOrderPreview(assignments);
  const throwWaves = getThrowOrderPreview(assignments, firstCallerLeadSeconds);

  return (
    <section className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg">
      <p className="text-rally-muted text-xs font-bold mb-1">HIT ORDER PREVIEW</p>
      <p className="text-rally-muted text-[11px] mb-3">
        Who arrives first after GO, based on current march times and offsets. Updates as you
        edit callers below.
      </p>

      <ol className="flex flex-col gap-2 mb-4">
        {hitWaves.map((wave, index) => (
          <li
            key={`hit-${wave.arrivalOffsetSeconds}-${wave.assignmentIds.join("-")}`}
            className="flex items-start gap-3"
          >
            <span
              className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                index === 0
                  ? "bg-rally-success/20 text-rally-success border border-rally-success"
                  : "bg-rally-bg text-rally-muted border border-rally-border"
              }`}
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm leading-tight">
                {wave.displayNames.join(" + ")}
              </p>
              <p className="text-rally-muted text-xs font-mono mt-0.5">
                Hits {formatHitOffsetLabel(wave.arrivalOffsetSeconds)}
                {wave.displayNames.length > 1 ? " · together" : ""}
              </p>
              <p className="text-rally-muted text-[11px]">
                March {Array.from(new Set(wave.marchLabels)).join(", ")}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="pt-3 border-t border-rally-border">
        <p className="text-rally-muted text-[10px] font-bold tracking-wide mb-2">
          THROW ORDER (after GO)
        </p>
        <ol className="flex flex-col gap-1.5">
          {throwWaves.map((wave, index) => (
            <li
              key={`throw-${wave.throwAfterGoSeconds}-${wave.assignmentIds.join("-")}`}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="text-rally-text font-bold min-w-0 truncate">
                <span className="text-rally-muted font-normal mr-1.5">{index + 1}.</span>
                {wave.displayNames.join(" + ")}
              </span>
              <span className="font-mono text-rally-accent shrink-0">
                GO+{wave.throwAfterGoSeconds}s
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
