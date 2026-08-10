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
    <div className="sticky top-0 z-40 border-b border-rally-border/80 bg-rally-bg/90 backdrop-blur-md pt-[env(safe-area-inset-top,0px)]">
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-rally-muted text-[10px] font-semibold tracking-[0.16em] uppercase shrink-0">
            Server
          </span>
          <span className="timer-display text-sm text-rally-snow">{display}</span>
        </div>
        <ConnectionIndicator isLive={isLive} label={isLive ? "Synced" : "Syncing"} />
      </div>
    </div>
  );
}
