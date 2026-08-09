"use client";

import { useCountdown } from "@/hooks/useCountdown";
import { formatArrivalTime, statusLabel } from "@/lib/display";

export function CallerCountdownRow({
  displayName,
  marchFormatted,
  launchTime,
  status,
  correctedNow,
  highlight,
}: {
  displayName: string;
  marchFormatted: string;
  launchTime: string | null;
  status: string;
  correctedNow: () => number;
  highlight?: boolean;
}) {
  const launchMs = launchTime ? new Date(launchTime).getTime() : null;
  const { display, isNow } = useCountdown(launchMs, correctedNow);

  return (
    <div
      className={`p-3 rounded-lg border ${
        highlight || isNow
          ? "bg-rally-accent/20 border-rally-accent"
          : "bg-rally-surface border-rally-border"
      }`}
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="font-bold">{displayName}</p>
          <p className="text-rally-muted text-xs font-mono">March {marchFormatted}</p>
        </div>
        <span className="text-xs">{statusLabel(status)}</span>
      </div>
      {launchTime ? (
        <div className="mt-2">
          <p className="text-rally-muted text-xs">THROW RALLY IN</p>
          <p className={`text-2xl font-mono font-bold ${isNow ? "text-rally-danger animate-pulse" : "text-rally-accent"}`}>
            {isNow ? "🚨 THROW RALLY NOW" : display}
          </p>
          <p className="text-rally-muted text-xs mt-1 font-mono">Launch {formatArrivalTime(launchTime)}</p>
        </div>
      ) : (
        <p className="text-rally-muted text-sm mt-2">Waiting for GO</p>
      )}
    </div>
  );
}
