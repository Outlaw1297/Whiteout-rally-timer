"use client";

import { useCountdown } from "@/hooks/useCountdown";
import { formatArrivalTime, statusLabel } from "@/lib/display";
import { StatusBadge, statusToneForAssignment } from "@/components/ui/StatusBadge";
import { SectionLabel } from "@/components/ui/AppShell";

export function CallerCountdownRow({
  displayNames,
  marchFormatted,
  launchTime,
  status,
  correctedNow,
  highlight,
}: {
  displayNames: string[];
  marchFormatted: string;
  launchTime: string | null;
  status: string;
  correctedNow: () => number;
  highlight?: boolean;
}) {
  const displayName = displayNames.join(", ");
  const launchMs = launchTime ? new Date(launchTime).getTime() : null;
  const { display, isNow } = useCountdown(launchMs, correctedNow);

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        isNow
          ? "bg-rally-launch/15 border-rally-launch motion-safe:animate-launch-pulse"
          : highlight
            ? "bg-rally-ice/10 border-rally-ice/50"
            : "bg-rally-surface border-rally-border"
      }`}
    >
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <p className="font-bold text-rally-snow truncate">{displayName}</p>
          <p className="text-rally-muted text-xs font-mono mt-0.5">
            March {marchFormatted}
          </p>
        </div>
        <StatusBadge tone={statusToneForAssignment(status, isNow)} pulse={isNow}>
          {isNow ? "Launch Now" : statusLabel(status)}
        </StatusBadge>
      </div>
      {launchTime ? (
        <div className="mt-3">
          <SectionLabel>{isNow ? "Action" : "Throw rally in"}</SectionLabel>
          {isNow ? (
            <p className="mt-1 text-3xl font-black uppercase tracking-tight text-rally-launch">
              Launch Now
            </p>
          ) : (
            <p className="timer-display text-3xl text-rally-ice mt-1">{display}</p>
          )}
          <p className="text-rally-muted text-xs mt-1.5 font-mono">
            Launch {formatArrivalTime(launchTime)}
          </p>
        </div>
      ) : (
        <p className="text-rally-muted text-sm mt-3">Waiting for GO</p>
      )}
    </div>
  );
}
