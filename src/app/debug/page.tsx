"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bug, RefreshCw } from "lucide-react";
import { useServerClock } from "@/hooks/useServerClock";
import { formatTimeWithMs } from "@/lib/time";
import { AppShell, Panel, SectionLabel } from "@/components/ui/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";

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
    <AppShell wide className="page-enter">
      <Link href="/" className="nav-link text-sm gap-1 mb-6 inline-flex">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back
      </Link>

      <div className="flex items-center gap-2 mb-6">
        <Bug className="h-5 w-5 text-rally-warning" aria-hidden />
        <h1 className="text-xl font-bold text-rally-snow">Debug / Health</h1>
      </div>

      <div className="space-y-4 font-mono text-sm">
        <Panel className="space-y-2">
          <SectionLabel>Clock Sync</SectionLabel>
          <div className="text-rally-muted mt-2 space-y-1">
            <div>Offset: <span className="text-rally-ice">{offset.toFixed(1)}ms</span></div>
            <div>Round-trip: <span className="text-rally-snow">{rtt.toFixed(1)}ms</span></div>
            <div className="flex items-center gap-2">
              Live: <StatusBadge tone={isLive ? "live" : "warning"}>{isLive ? "yes" : "no"}</StatusBadge>
            </div>
            <div>Last sync: {lastSyncAt ? formatTimeWithMs(new Date(lastSyncAt)) : "never"}</div>
          </div>
          <button onClick={sync} className="btn-primary !min-h-[36px] text-xs mt-2 gap-1">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Force Sync
          </button>
        </Panel>

        {health && (
          <Panel className="space-y-2">
            <SectionLabel>Server Health</SectionLabel>
            <div className="text-rally-muted mt-2 space-y-1">
              <div>Server Time: <span className="text-rally-snow">{String(health.serverTime)}</span></div>
              <div>Unix Ms: {String(health.unixMs)}</div>
              <div>NTP Synced: {String(health.ntpSynchronized)}</div>
            </div>
            <pre className="text-xs text-rally-muted whitespace-pre-wrap mt-2 p-2 bg-rally-bg border border-rally-border rounded-lg">
              {String(health.ntpDetails || "")}
            </pre>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
