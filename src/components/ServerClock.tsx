"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { formatTimeLocal } from "@/lib/time";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { Panel, SectionLabel } from "@/components/ui/AppShell";

export function ServerClock({
  correctedNow,
  isLive,
  compact = false,
}: {
  correctedNow: () => number;
  isLive?: boolean;
  compact?: boolean;
}) {
  const [display, setDisplay] = useState("--:--:--");

  useEffect(() => {
    let interval = 0;
    const tick = () => setDisplay(formatTimeLocal(new Date(correctedNow())));
    tick();
    interval = window.setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [correctedNow]);

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm font-mono">
        <div className="inline-flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-rally-muted" aria-hidden />
          <span className="text-rally-muted text-xs">Server</span>
          <span className="font-semibold text-rally-snow">{display}</span>
        </div>
        {isLive !== undefined && <ConnectionIndicator isLive={isLive} />}
      </div>
    );
  }

  return (
    <Panel className="mb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-rally-ice" aria-hidden />
            <SectionLabel>Server Time</SectionLabel>
          </div>
          <p className="timer-display text-2xl mt-1">{display}</p>
        </div>
        {isLive !== undefined && (
          <ConnectionIndicator isLive={isLive} label={isLive ? "SYNCED" : "SYNCING"} />
        )}
      </div>
    </Panel>
  );
}
