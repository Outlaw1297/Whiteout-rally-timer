"use client";

import { useEffect, useState } from "react";
import { formatTimeLocal } from "@/lib/time";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";

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
        <div>
          <span className="text-rally-muted text-xs mr-2">SERVER</span>
          <span className="font-bold">{display}</span>
        </div>
        {isLive !== undefined && <ConnectionIndicator isLive={isLive} />}
      </div>
    );
  }

  return (
    <section className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-rally-muted text-xs">SERVER TIME</p>
          <p className="text-2xl font-mono font-bold">{display}</p>
        </div>
        {isLive !== undefined && (
          <ConnectionIndicator isLive={isLive} label={isLive ? "SYNCED" : "SYNCING"} />
        )}
      </div>
    </section>
  );
}
