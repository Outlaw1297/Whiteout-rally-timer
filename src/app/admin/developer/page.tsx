"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { HomeButton } from "@/components/HomeButton";
import { isDeveloperRole, roleLabel } from "@/lib/roles";

interface DeviceRow {
  id: string;
  platform: string;
  userAgent: string | null;
  deliveryLeadMs: number;
  deliverySampleCount: number;
  lastCalibratedAt: string | null;
  updatedAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    role: string;
    lastLoginAt: string | null;
    successfulNotifications: number;
    missedNotifications: number;
    failedNotifications: number;
  };
}

interface UserStats {
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
}

interface ClockInfo {
  serverTime: string;
  unixMs: number;
  ntpSynchronized: boolean;
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

export default function DeveloperPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [users, setUsers] = useState<UserStats[]>([]);
  const [clock, setClock] = useState<ClockInfo | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [vapidSource, setVapidSource] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const clientSend = Date.now();
      const [devRes, timeRes] = await Promise.all([
        fetch("/api/admin/developer/diagnostics"),
        fetch("/api/health/time", {
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
      setDevices(devData.devices || []);
      setUsers(devData.users || []);
      setPushEnabled(!!devData.pushEnabled);
      setVapidSource(devData.vapidSource || null);

      if (timeRes.ok) {
        const timeData = await timeRes.json();
        const rtt = clientReceive - clientSend;
        const offset = timeData.unixMs - (clientSend + rtt / 2);
        setClock({
          serverTime: timeData.serverTime,
          unixMs: timeData.unixMs,
          ntpSynchronized: !!timeData.ntpSynchronized,
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

  if (loading || !user) {
    return <div className="p-8 text-center text-rally-muted">Loading...</div>;
  }

  const q = query.trim().toLowerCase();
  const filteredDevices = q
    ? devices.filter(
        (d) =>
          d.user.displayName.toLowerCase().includes(q) ||
          d.user.username.toLowerCase().includes(q) ||
          d.platform.toLowerCase().includes(q)
      )
    : devices;
  const filteredUsers = q
    ? users.filter(
        (u) =>
          u.displayName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q)
      )
    : users;

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
        Device health, delivery stats, and server clock diagnostics. Developer-only.
      </p>

      {error && <p className="text-rally-danger text-sm mb-4">{error}</p>}

      <section className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg space-y-2">
        <p className="text-rally-muted text-xs font-bold">SERVER CLOCK / NTP</p>
        {clock ? (
          <>
            <p className="font-mono text-sm">{clock.serverTime}</p>
            <p className="text-xs text-rally-muted">
              NTP synchronized:{" "}
              <span className={clock.ntpSynchronized ? "text-rally-success" : "text-rally-danger"}>
                {clock.ntpSynchronized ? "yes" : "no / unknown"}
              </span>
            </p>
            <p className="text-xs text-rally-muted">
              Client↔server offset:{" "}
              <span className="font-mono text-rally-accent">
                {clock.clientOffsetMs != null
                  ? `${clock.clientOffsetMs >= 0 ? "+" : ""}${clock.clientOffsetMs}ms`
                  : "—"}
              </span>
              {clock.rttMs != null ? ` · RTT ${clock.rttMs}ms` : ""}
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
          placeholder="Filter devices / users…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-3 py-2 bg-rally-surface border border-rally-border rounded text-sm"
        />
      </div>

      <section className="mb-6">
        <h2 className="text-rally-muted text-xs mb-2">
          USERS ({filteredUsers.length})
        </h2>
        <div className="flex flex-col gap-2">
          {filteredUsers.map((u) => (
            <div
              key={u.id}
              className="p-3 bg-rally-surface border border-rally-border rounded-lg text-sm"
            >
              <p className="font-bold">
                {u.displayName}{" "}
                <span className="text-rally-muted text-xs font-normal">@{u.username}</span>
              </p>
              <p className="text-rally-muted text-xs mt-1">
                {roleLabel(u.role)} · {u.deviceCount} device{u.deviceCount !== 1 ? "s" : ""}
                {u.deliveryLeadMs != null
                  ? ` · ${u.deliveryLeadMs}ms lead (${u.deliverySampleCount} samples)`
                  : ""}
              </p>
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
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-rally-muted text-xs mb-2">
          DEVICES ({filteredDevices.length})
        </h2>
        <div className="flex flex-col gap-2">
          {filteredDevices.map((d) => (
            <div
              key={d.id}
              className="p-3 bg-rally-surface border border-rally-border rounded-lg text-sm"
            >
              <div className="flex justify-between gap-2">
                <p className="font-bold">
                  {d.user.displayName}{" "}
                  <span className="text-rally-muted text-xs font-normal">@{d.user.username}</span>
                </p>
                <span className="text-rally-accent text-xs font-mono">{d.platform}</span>
              </div>
              <p className="text-rally-muted text-xs mt-1 font-mono">
                Lead {d.deliveryLeadMs}ms · {d.deliverySampleCount} samples
              </p>
              <p className="text-rally-muted text-[11px] mt-1">
                Calibrated {formatWhen(d.lastCalibratedAt)} · Updated {formatWhen(d.updatedAt)} ·
                Login {formatWhen(d.user.lastLoginAt)}
              </p>
              <p className="text-[11px] mt-1">
                <span className="text-rally-success">
                  ✓ {d.user.successfulNotifications} sent
                </span>
                {" · "}
                <span className="text-rally-danger">✗ {d.user.failedNotifications} failed</span>
                {" · "}
                <span className="text-rally-warning">
                  ⚠ {d.user.missedNotifications} missed/skipped
                </span>
              </p>
              {d.userAgent && (
                <p className="text-[10px] text-rally-muted mt-1 truncate" title={d.userAgent}>
                  {d.userAgent}
                </p>
              )}
            </div>
          ))}
          {filteredDevices.length === 0 && (
            <p className="text-rally-muted text-sm text-center py-4">No active devices</p>
          )}
        </div>
      </section>
    </main>
  );
}
