"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useServerClock } from "@/hooks/useServerClock";
import { formatTimeWithMs } from "@/lib/time";

export default function DebugPage() {
  const { offset, rtt, isLive, lastSyncAt, sync } = useServerClock({ useWebSocket: false });
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch("/api/health/time")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-8">
      <Link href="/" className="self-start text-rally-muted text-sm hover:text-rally-accent mb-6">
        ← Back
      </Link>

      <h1 className="text-xl font-bold text-rally-warning mb-8">DEBUG / HEALTH</h1>

      <div className="w-full max-w-lg space-y-6 font-mono text-sm">
        <section className="p-4 bg-rally-surface border border-rally-border rounded-lg space-y-2">
          <h2 className="text-rally-accent font-bold">Clock Sync</h2>
          <div>Offset: {offset.toFixed(1)}ms</div>
          <div>Round-trip: {rtt.toFixed(1)}ms</div>
          <div>Live: {isLive ? "yes" : "no"}</div>
          <div>Last sync: {lastSyncAt ? formatTimeWithMs(new Date(lastSyncAt)) : "never"}</div>
          <button
            onClick={sync}
            className="mt-2 py-2 px-4 bg-rally-accent text-white rounded text-xs"
          >
            Force Sync
          </button>
        </section>

        {health && (
          <section className="p-4 bg-rally-surface border border-rally-border rounded-lg space-y-2">
            <h2 className="text-rally-accent font-bold">Server Health</h2>
            <div>Server Time: {String(health.serverTime)}</div>
            <div>Unix Ms: {String(health.unixMs)}</div>
            <div>NTP Synced: {String(health.ntpSynchronized)}</div>
            <pre className="text-xs text-rally-muted whitespace-pre-wrap">
              {String(health.ntpDetails || "")}
            </pre>
          </section>
        )}
      </div>
    </main>
  );
}
