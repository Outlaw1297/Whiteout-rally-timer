"use client";

import { useEffect, useState } from "react";
import { useServerClock } from "@/hooks/useServerClock";
import { formatTimeLocal } from "@/lib/time";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";

/**
 * App-wide synced server clock. Mount once in the root layout so every page
 * shows the same authoritative time without each page wiring its own display.
 */
export function GlobalSyncedClock() {
  const { correctedNow, isLive } = useServerClock({
    activeRally: true,
    useWebSocket: true,
  });
  const [display, setDisplay] = useState("--:--:--");

  useEffect(() => {
    const tick = () => setDisplay(formatTimeLocal(new Date(correctedNow())));
    tick();
    const interval = window.setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [correctedNow]);

  return (
    <div className="sticky top-0 z-40 border-b border-rally-border bg-rally-bg/95 backdrop-blur-sm">
      <div className="max-w-lg mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-rally-muted text-[10px] font-bold tracking-wide shrink-0">
            SERVER TIME
          </span>
          <span className="font-mono font-bold text-sm tabular-nums">{display}</span>
        </div>
        <ConnectionIndicator isLive={isLive} label={isLive ? "SYNCED" : "SYNCING"} />
      </div>
    </div>
  );
}
