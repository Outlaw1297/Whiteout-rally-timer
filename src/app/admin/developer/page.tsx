"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Clock,
  Radio,
  Send,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AdminNav } from "@/components/AdminNav";
import { AppShell, Panel, SectionLabel } from "@/components/ui/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { isDeveloperRole, roleLabel } from "@/lib/roles";

interface DeviceInfo {
  id: string;
  platform: string;
  userAgent: string | null;
  deliveryLeadMs: number;
  deliverySampleCount: number;
  lastCalibratedAt: string | null;
  lastSeenAt?: string | null;
  online?: boolean;
  updatedAt: string;
}

interface NotificationStats {
  successfulNotifications: number;
  failedNotifications: number;
  missedNotifications: number;
  pendingNotifications: number;
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
  lastSeenAt?: string | null;
  online?: boolean;
  successfulNotifications: number;
  missedNotifications: number;
  failedNotifications: number;
  pendingNotifications?: number;
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
  const [notificationSummary, setNotificationSummary] = useState<NotificationStats | null>(
    null
  );
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Array<{
    subscriptionId: string;
    platform: string | null;
    user: string;
    success: boolean;
    error?: string;
  }> | null>(null);
  const [statusMsg, setStatusMsg] = useState("");

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
      setNotificationSummary(devData.summary?.notifications || null);

      if (timeRes.ok) {
        const timeData = await timeRes.json();
        const rtt = clientReceive - clientSend;

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

  const sendTest = useCallback(
    async (opts: { subscriptionId?: string; userId?: string; all?: boolean }) => {
      setError("");
      setStatusMsg("");
      setTestResults(null);
      setTesting(opts.all ? "all" : opts.subscriptionId || opts.userId || "one");
      try {
        const res = await fetch("/api/admin/push/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(opts),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Test failed");
          return;
        }
        setTestResults(data.results || []);
        setStatusMsg(
          `Sent to ${data.devicesNotified}/${data.devicesTested} device${
            data.devicesTested === 1 ? "" : "s"
          }`
        );
        load();
      } catch {
        setError("Test request failed");
      } finally {
        setTesting(null);
      }
    },
    [load]
  );

  const deleteDevice = useCallback(
    async (deviceId: string, platform: string) => {
      if (!confirm(`Remove ${platform} device from the list?`)) return;
      setError("");
      setStatusMsg("");
      try {
        const res = await fetch(`/api/admin/push/devices/${deviceId}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Failed to delete device");
          return;
        }
        setStatusMsg(data.message || "Device removed");
        load();
      } catch {
        setError("Failed to delete device");
      }
    },
    [load]
  );

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
    <AppShell wide className="page-enter">
      <AdminNav displayName={user.displayName} role={user.role} onLogout={logout} />

      <h1 className="text-xl font-bold text-rally-snow mb-1">Developer</h1>
      <p className="text-rally-muted text-sm mb-4">
        Users with nested devices, delivery stats, and server clock diagnostics.
      </p>

      {error && (
        <Panel className="mb-4 border-rally-danger/40 bg-rally-danger/10">
          <p className="text-rally-danger text-sm">{error}</p>
        </Panel>
      )}

      <Panel accent className="mb-4 space-y-3">
        <div className="flex justify-between items-start gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-rally-ice shrink-0" aria-hidden />
            <SectionLabel>Server Clock / NTP</SectionLabel>
          </div>
          <button
            type="button"
            disabled={!pushEnabled || testing === "all" || totalDevices === 0}
            onClick={() => sendTest({ all: true })}
            className="btn-primary !min-h-[36px] !py-1.5 text-xs gap-1"
          >
            <Send className="h-3 w-3" aria-hidden />
            {testing === "all" ? "Testing…" : "Test All Devices"}
          </button>
        </div>
        {clock ? (
          <>
            <p className="font-mono text-sm text-rally-snow">{clock.serverTime}</p>
            <p className="text-xs text-rally-muted">
              NTP:{" "}
              <StatusBadge tone={ntpOk ? "success" : "danger"}>{ntpLabel}</StatusBadge>
              {clock.ntpSource ? ` · via ${clock.ntpSource}` : ""}
            </p>
            <p className="text-xs text-rally-muted">
              Client↔server offset:{" "}
              <span
                className={`font-mono ${
                  Math.abs(clock.clientOffsetMs || 0) > 2000
                    ? "text-rally-warning"
                    : "text-rally-ice"
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
              <pre className="text-[10px] text-rally-muted whitespace-pre-wrap max-h-28 overflow-auto border border-rally-border rounded-lg p-2 bg-rally-bg font-mono">
                {clock.ntpDetails}
              </pre>
            )}
          </>
        ) : (
          <p className="text-rally-muted text-sm">Loading clock…</p>
        )}
        <p className="text-xs text-rally-muted flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Push:{" "}
          <StatusBadge tone={pushEnabled ? "success" : "danger"}>
            {pushEnabled ? "ready" : "not configured"}
          </StatusBadge>
          {vapidSource ? ` · source ${vapidSource}` : ""}
        </p>
      </Panel>

      {(statusMsg || (testResults && testResults.length > 0)) && (
        <Panel className="mb-4 text-xs space-y-1">
          {statusMsg && <p className="text-rally-success font-semibold">{statusMsg}</p>}
          {testResults?.map((r) => (
            <p
              key={r.subscriptionId}
              className={`flex items-center gap-1.5 ${
                r.success ? "text-rally-success" : "text-rally-danger"
              }`}
            >
              {r.success ? (
                <Check className="h-3 w-3 shrink-0" aria-hidden />
              ) : (
                <X className="h-3 w-3 shrink-0" aria-hidden />
              )}
              {r.user} · {r.platform || "unknown"}
              {r.error ? ` — ${r.error}` : ""}
            </p>
          ))}
        </Panel>
      )}

      {notificationSummary && (
        <Panel className="mb-4">
          <SectionLabel>Rally notification totals</SectionLabel>
          <p className="text-[11px] text-rally-muted mt-1 mb-2">
            Scheduled rally alerts only (not Developer Test pushes). Sent = delivered to at least
            one device.
          </p>
          <p className="text-xs flex flex-wrap gap-x-3 gap-y-1">
            <span className="text-rally-success inline-flex items-center gap-1">
              <Check className="h-3.5 w-3.5" aria-hidden />
              {notificationSummary.successfulNotifications} sent
            </span>
            <span className="text-rally-danger inline-flex items-center gap-1">
              <X className="h-3.5 w-3.5" aria-hidden />
              {notificationSummary.failedNotifications} failed
            </span>
            <span className="text-rally-warning inline-flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {notificationSummary.missedNotifications} missed/skipped
            </span>
            <span className="text-rally-muted inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {notificationSummary.pendingNotifications} pending
            </span>
          </p>
        </Panel>
      )}

      <div className="mb-4">
        <input
          type="search"
          placeholder="Filter users or devices…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input-field text-sm"
        />
        <p className="text-rally-muted text-[11px] mt-1">
          {filteredUsers.length} users · {totalDevices} active devices
        </p>
      </div>

      <section className="mb-8">
        <SectionLabel>Users & Devices</SectionLabel>
        <div className="flex flex-col gap-3 mt-2">
          {filteredUsers.map((u) => (
            <Panel key={u.id} className="!p-3 text-sm">
              <div className="flex justify-between gap-2 items-start">
                <div className="min-w-0">
                  <p className="font-bold text-rally-snow flex flex-wrap items-center gap-1.5">
                    {u.displayName}{" "}
                    <span className="text-rally-muted text-xs font-normal">@{u.username}</span>
                    <StatusBadge tone={u.online ? "live" : "neutral"} pulse={!!u.online}>
                      {u.online ? "Online" : "Offline"}
                    </StatusBadge>
                    {!u.active && (
                      <StatusBadge tone="danger">
                        disabled
                      </StatusBadge>
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
                {u.devices.length > 0 && (
                  <button
                    type="button"
                    disabled={!pushEnabled || testing === u.id}
                    onClick={() => sendTest({ userId: u.id })}
                    className="btn-secondary !min-h-[32px] !py-1 !px-2 text-xs shrink-0 gap-1"
                  >
                    <Send className="h-3 w-3" aria-hidden />
                    {testing === u.id ? "…" : "Test User"}
                  </button>
                )}
              </div>

              <p className="text-rally-muted text-[11px] mt-1">
                Login {formatWhen(u.lastLoginAt)} · Seen {formatWhen(u.lastSeenAt)} · Calibrated{" "}
                {formatWhen(u.lastCalibratedAt)}
              </p>
              <p className="text-[10px] text-rally-muted mt-2 uppercase tracking-wide">
                Linked rally alerts
              </p>
              <p className="text-[11px] mt-0.5 flex flex-wrap gap-x-2">
                <span className="text-rally-success inline-flex items-center gap-1">
                  <Check className="h-3 w-3" aria-hidden />
                  {u.successfulNotifications} sent
                </span>
                <span className="text-rally-danger inline-flex items-center gap-1">
                  <X className="h-3 w-3" aria-hidden />
                  {u.failedNotifications} failed
                </span>
                <span className="text-rally-warning inline-flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  {u.missedNotifications} missed/skipped
                </span>
                {(u.pendingNotifications ?? 0) > 0 && (
                  <span className="text-rally-muted inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden />
                    {u.pendingNotifications} pending
                  </span>
                )}
              </p>

              {u.devices.length === 0 ? (
                <p className="text-rally-warning text-xs mt-3 pt-3 border-t border-rally-border">
                  No active devices — user needs to enable notifications
                </p>
              ) : (
                <div className="mt-3 pt-3 border-t border-rally-border space-y-2">
                  <p className="text-rally-muted text-[10px] font-semibold tracking-wide flex items-center gap-1">
                    <Smartphone className="h-3 w-3" aria-hidden />
                    Devices ({u.devices.length})
                  </p>
                  {u.devices.map((d) => (
                    <div
                      key={d.id}
                      className="p-2 bg-rally-bg border border-rally-border rounded-lg text-xs"
                    >
                      <div className="flex justify-between gap-2 items-start">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-rally-ice">{d.platform}</span>
                            <StatusBadge tone={d.online ? "live" : "neutral"} pulse={!!d.online}>
                              {d.online ? "Online" : "Offline"}
                            </StatusBadge>
                          </div>
                          <span className="font-mono text-rally-muted">
                            lead {d.deliveryLeadMs}ms · {d.deliverySampleCount} samples
                          </span>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={!pushEnabled || testing === d.id}
                            onClick={() => sendTest({ subscriptionId: d.id })}
                            className="btn-primary !min-h-[28px] !py-0.5 !px-2 text-[11px]"
                          >
                            {testing === d.id ? "…" : "Test"}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteDevice(d.id, d.platform)}
                            className="btn-ghost !min-h-[28px] !py-0.5 !px-2 text-[11px] text-rally-danger"
                            title="Remove device"
                          >
                            <Trash2 className="h-3 w-3" aria-hidden />
                          </button>
                        </div>
                      </div>
                      <p className="text-rally-muted text-[11px] mt-1">
                        Seen {formatWhen(d.lastSeenAt)} · Calibrated {formatWhen(d.lastCalibratedAt)}
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
            </Panel>
          ))}
          {filteredUsers.length === 0 && (
            <p className="text-rally-muted text-sm text-center py-4">No users match</p>
          )}
        </div>
      </section>
    </AppShell>
  );
}
