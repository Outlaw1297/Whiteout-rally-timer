"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { HomeButton } from "@/components/HomeButton";
import { isDeveloperRole, roleLabel } from "@/lib/roles";

interface DeviceInfo {
  id: string;
  platform: string;
  userAgent: string | null;
  deliveryLeadMs: number;
  deliverySampleCount: number;
  lastCalibratedAt: string | null;
  updatedAt: string;
}

interface UserWithDevices {
  id: string;
  username: string;
  displayName: string;
  role: string;
  active: boolean;
  deviceCount: number;
  deliveryLeadMs: number | null;
  deliverySampleCount: number;
  lastCalibratedAt: string | null;
  lastLoginAt: string | null;
  successfulNotifications: number;
  missedNotifications: number;
  failedNotifications: number;
  devices: DeviceInfo[];
}

interface ClockInfo {
  serverTime: string;
  unixMs: number;
  ntpSynchronized: boolean;
  ntpStatus?: string;
  ntpSource?: string;
  ntpDetails?: string;
  clientOffsetMs?: number;
  rttMs?: number;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "never";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatOffset(ms: number | undefined | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const abs = Math.abs(ms);
  if (abs >= 60_000) {
    const minutes = (ms / 60_000).toFixed(1);
    return `${ms >= 0 ? "+" : ""}${minutes} min (${Math.round(ms)}ms)`;
  }
  return `${ms >= 0 ? "+" : ""}${Math.round(ms)}ms`;
}

export default function DeveloperPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserWithDevices[]>([]);
  const [clock, setClock] = useState<ClockInfo | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [vapidSource, setVapidSource] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const clientSend = Date.now();
      const [devRes, timeRes] = await Promise.all([
        fetch("/api/admin/developer/diagnostics", { cache: "no-store" }),
        fetch("/api/health/time", {
          cache: "no-store",
          headers: { "x-client-send-time": String(clientSend) },
        }),
      ]);
      const clientReceive = Date.now();

      if (devRes.status === 403) {
        router.push("/admin");
        return;
      }
      const devData = await devRes.json();
      if (!devRes.ok) {
        setError(devData.error || "Failed to load diagnostics");
        return;
      }
      setUsers(devData.users || []);
      setPushEnabled(!!devData.pushEnabled);
      setVapidSource(devData.vapidSource || null);

      if (timeRes.ok) {
        const timeData = await timeRes.json();
        const rtt =
          typeof timeData.serverSendTime === "number" &&
          typeof timeData.serverReceiveTime === "number"
            ? clientReceive - clientSend
            : clientReceive - clientSend;

        // Prefer NTP-style midpoint when the health route echoes timestamps.
        let offset: number;
        if (
          typeof timeData.serverReceiveTime === "number" &&
          typeof timeData.serverSendTime === "number"
        ) {
          offset =
            (timeData.serverReceiveTime -
              clientSend +
              (timeData.serverSendTime - clientReceive)) /
            2;
        } else {
          offset = timeData.unixMs - (clientSend + rtt / 2);
        }

        setClock({
          serverTime: timeData.serverTime,
          unixMs: timeData.unixMs,
          ntpSynchronized: !!timeData.ntpSynchronized,
          ntpStatus: timeData.ntpStatus,
          ntpSource: timeData.ntpSource,
          ntpDetails: timeData.ntpDetails,
          clientOffsetMs: Math.round(offset),
          rttMs: rtt,
        });
      }
      setError("");
    } catch {
      setError("Failed to load developer diagnostics");
    }
  }, [router]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && !isDeveloperRole(user.role)) {
      router.push(user.role === "ADMIN" ? "/admin" : "/caller");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && isDeveloperRole(user.role)) {
      load();
      const interval = setInterval(load, 8000);
      return () => clearInterval(interval);
    }
  }, [user, load]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        u.devices.some(
          (d) =>
            d.platform.toLowerCase().includes(q) ||
            (d.userAgent || "").toLowerCase().includes(q)
        )
    );
  }, [users, query]);

  if (loading || !user) {
    return <div className="p-8 text-center text-rally-muted">Loading...</div>;
  }

  const totalDevices = users.reduce((sum, u) => sum + u.devices.length, 0);
  const ntpLabel =
    clock?.ntpStatus === "synchronized"
      ? "yes"
      : clock?.ntpStatus === "unavailable"
        ? "host-managed (timedatectl N/A)"
        : clock?.ntpSynchronized
          ? "yes"
          : "no";
  const ntpOk = clock?.ntpSynchronized !== false;

  return (
    <main className="min-h-screen px-4 py-6 max-w-2xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <Link href="/admin" className="text-rally-muted text-sm hover:text-rally-accent">
          ← Admin
        </Link>
        <div className="flex items-center gap-3">
          <HomeButton />
          <button onClick={logout} className="text-rally-muted text-sm hover:text-rally-danger">
            Logout
          </button>
        </div>
      </header>

      <h1 className="text-xl font-bold mb-1">Developer</h1>
      <p className="text-rally-muted text-sm mb-4">
        Users with nested devices, delivery stats, and server clock diagnostics.
      </p>

      {error && <p className="text-rally-danger text-sm mb-4">{error}</p>}

      <section className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg space-y-2">
        <p className="text-rally-muted text-xs font-bold">SERVER CLOCK / NTP</p>
        {clock ? (
          <>
            <p className="font-mono text-sm">{clock.serverTime}</p>
            <p className="text-xs text-rally-muted">
              NTP:{" "}
              <span className={ntpOk ? "text-rally-success" : "text-rally-danger"}>
                {ntpLabel}
              </span>
              {clock.ntpSource ? ` · via ${clock.ntpSource}` : ""}
            </p>
            <p className="text-xs text-rally-muted">
              Client↔server offset:{" "}
              <span
                className={`font-mono ${
                  Math.abs(clock.clientOffsetMs || 0) > 2000
                    ? "text-rally-warning"
                    : "text-rally-accent"
                }`}
              >
                {formatOffset(clock.clientOffsetMs)}
              </span>
              {clock.rttMs != null ? ` · RTT ${clock.rttMs}ms` : ""}
            </p>
            <p className="text-[11px] text-rally-muted">
              On Render, containers usually have no systemd/timedatectl. The host still keeps NTP
              time — “host-managed” is expected, not a failure.
            </p>
            {clock.ntpDetails && (
              <pre className="text-[10px] text-rally-muted whitespace-pre-wrap max-h-28 overflow-auto border border-rally-border rounded p-2 bg-rally-bg">
                {clock.ntpDetails}
              </pre>
            )}
          </>
        ) : (
          <p className="text-rally-muted text-sm">Loading clock…</p>
        )}
        <p className="text-xs text-rally-muted">
          Push:{" "}
          <span className={pushEnabled ? "text-rally-success" : "text-rally-danger"}>
            {pushEnabled ? "ready" : "not configured"}
          </span>
          {vapidSource ? ` · source ${vapidSource}` : ""}
        </p>
      </section>

      <div className="mb-4">
        <input
          type="search"
          placeholder="Filter users or devices…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-3 py-2 bg-rally-surface border border-rally-border rounded text-sm"
        />
        <p className="text-rally-muted text-[11px] mt-1">
          {filteredUsers.length} users · {totalDevices} active devices
        </p>
      </div>

      <section className="mb-8">
        <h2 className="text-rally-muted text-xs mb-2">USERS & DEVICES</h2>
        <div className="flex flex-col gap-3">
          {filteredUsers.map((u) => (
            <div
              key={u.id}
              className="p-3 bg-rally-surface border border-rally-border rounded-lg text-sm"
            >
              <div className="flex justify-between gap-2 items-start">
                <div>
                  <p className="font-bold">
                    {u.displayName}{" "}
                    <span className="text-rally-muted text-xs font-normal">@{u.username}</span>
                    {!u.active && (
                      <span className="text-rally-danger text-xs ml-2">disabled</span>
                    )}
                  </p>
                  <p className="text-rally-muted text-xs mt-0.5">
                    {roleLabel(u.role)} · {u.deviceCount} device
                    {u.deviceCount !== 1 ? "s" : ""}
                    {u.deliveryLeadMs != null
                      ? ` · ${u.deliveryLeadMs}ms avg lead (${u.deliverySampleCount} samples)`
                      : ""}
                  </p>
                </div>
              </div>

              <p className="text-rally-muted text-[11px] mt-1">
                Login {formatWhen(u.lastLoginAt)} · Calibrated {formatWhen(u.lastCalibratedAt)}
              </p>
              <p className="text-[11px] mt-1">
                <span className="text-rally-success">✓ {u.successfulNotifications} sent</span>
                {" · "}
                <span className="text-rally-danger">✗ {u.failedNotifications} failed</span>
                {" · "}
                <span className="text-rally-warning">⚠ {u.missedNotifications} missed/skipped</span>
              </p>

              {u.devices.length === 0 ? (
                <p className="text-rally-warning text-xs mt-3 pt-3 border-t border-rally-border">
                  No active devices — user needs to enable notifications
                </p>
              ) : (
                <div className="mt-3 pt-3 border-t border-rally-border space-y-2">
                  <p className="text-rally-muted text-[10px] font-bold tracking-wide">
                    DEVICES ({u.devices.length})
                  </p>
                  {u.devices.map((d) => (
                    <div
                      key={d.id}
                      className="p-2 bg-rally-bg border border-rally-border rounded text-xs"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-mono text-rally-accent">{d.platform}</span>
                        <span className="font-mono text-rally-muted">
                          lead {d.deliveryLeadMs}ms · {d.deliverySampleCount} samples
                        </span>
                      </div>
                      <p className="text-rally-muted text-[11px] mt-1">
                        Calibrated {formatWhen(d.lastCalibratedAt)} · Updated{" "}
                        {formatWhen(d.updatedAt)}
                      </p>
                      {d.userAgent && (
                        <p
                          className="text-[10px] text-rally-muted mt-1 truncate"
                          title={d.userAgent}
                        >
                          {d.userAgent}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {filteredUsers.length === 0 && (
            <p className="text-rally-muted text-sm text-center py-4">No users match</p>
          )}
        </div>
      </section>
    </main>
  );
}
