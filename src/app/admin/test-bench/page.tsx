"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { HomeButton } from "@/components/HomeButton";

interface DeviceRow {
  id: string;
  platform: string;
  userAgent: string | null;
  deliveryLeadMs?: number;
  deliverySampleCount?: number;
  updatedAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };
}

interface BenchData {
  pushEnabled: boolean;
  vapidSource: string | null;
  autoManaged: boolean;
  devices: DeviceRow[];
  users: Array<{
    id: string;
    username: string;
    displayName: string;
    role: string;
    active: boolean;
    deviceCount: number;
  }>;
  summary: {
    totalDevices: number;
    android: number;
    ios: number;
    desktop: number;
    unknown: number;
  };
}

interface TestResult {
  subscriptionId: string;
  platform: string | null;
  user: string;
  success: boolean;
  error?: string;
}

const SETUP_STEPS = [
  {
    platform: "Android",
    target: 2,
    steps: [
      "Open https://whiteout-rally-timer.onrender.com in Chrome",
      "Menu → Install app / Add to Home screen",
      "Open installed PWA, log in as a test caller",
      "Tap Enable Rally Notifications, then Send Test Notification",
    ],
  },
  {
    platform: "iOS",
    target: 2,
    optional: true,
    steps: [
      "Open the site in Safari (not Chrome)",
      "Share → Add to Home Screen",
      "Open the installed PWA, log in as a test caller",
      "Tap Enable Rally Notifications (iOS 16.4+ required)",
    ],
  },
  {
    platform: "Desktop Web",
    target: 2,
    steps: [
      "Open the site in Chrome or Firefox on desktop",
      "Log in as a test caller",
      "Click Enable Rally Notifications and allow browser permission",
      "Keep tab open or in background to verify delivery",
    ],
  },
];

export default function TestBenchPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [bench, setBench] = useState<BenchData | null>(null);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copiedInvite, setCopiedInvite] = useState(false);

  const loadBench = useCallback(async () => {
    const res = await fetch("/api/admin/push/devices");
    if (res.ok) {
      setBench(await res.json());
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && user.role !== "ADMIN") router.push("/caller");
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      loadBench();
      const interval = setInterval(loadBench, 5000);
      return () => clearInterval(interval);
    }
  }, [user, loadBench]);

  const copyIosInvite = async () => {
    const text = `Whiteout Rally Timer — iOS push test (5 min)

1. Open in Safari (not Chrome): https://whiteout-rally-timer.onrender.com
2. Tap Share → Add to Home Screen
3. Open the app from your home screen (must be installed PWA)
4. Log in with the test account I send you
5. Tap "Enable Rally Notifications" → allow
6. Tap "Send Test Notification"
7. Tell me: did it work? (app open / background / screen locked)

Requires iPhone/iPad on iOS 16.4 or newer.`;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 3000);
    } catch {
      setError("Could not copy — select and copy the text below manually");
    }
  };

  const sendTest = async (opts: { subscriptionId?: string; all?: boolean }) => {
    setError("");
    setTestResults(null);
    setTesting(opts.all ? "all" : opts.subscriptionId || "one");
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
      loadBench();
    } finally {
      setTesting(null);
    }
  };

  if (loading || !user) {
    return <div className="p-8 text-center text-rally-muted">Loading...</div>;
  }

  const summary = bench?.summary;

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      <header className="flex items-center justify-between mb-6">
        <Link href="/admin" className="text-rally-muted text-sm hover:text-rally-accent">
          ← Admin
        </Link>
        <div className="flex items-center gap-3">
          <HomeButton />
          <Link href="/admin/users" className="text-rally-muted text-sm hover:text-rally-accent">
            Users
          </Link>
        </div>
      </header>

      <h1 className="text-xl font-bold mb-2">Notification Test Bench</h1>
      <p className="text-rally-muted text-sm mb-4">
        Register Android and web devices locally. iOS requires a real iPhone/iPad — see
        alternatives below if you do not have one.
      </p>

      {bench && (
        <section className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg text-sm">
          <div className="flex justify-between items-start gap-2 mb-3">
            <div>
              <p className="text-rally-muted text-xs">PUSH STATUS</p>
              <p className={bench.pushEnabled ? "text-rally-success font-bold" : "text-rally-danger font-bold"}>
                {bench.pushEnabled ? "✓ Ready" : "✗ Not configured"}
              </p>
              <p className="text-rally-muted text-xs mt-1">
                Source: {bench.vapidSource || "unknown"}
                {bench.autoManaged && " (auto-managed)"}
              </p>
            </div>
            <button
              onClick={() => sendTest({ all: true })}
              disabled={testing !== null || (bench.summary.totalDevices === 0)}
              className="px-3 py-2 bg-rally-accent text-white text-xs font-bold rounded disabled:opacity-50"
            >
              {testing === "all" ? "TESTING..." : "TEST ALL"}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <CountBadge label="Android" count={summary?.android ?? 0} target={2} />
            <CountBadge label="iOS" count={summary?.ios ?? 0} target={2} />
            <CountBadge label="Web" count={summary?.desktop ?? 0} target={2} />
          </div>
        </section>
      )}

      {error && (
        <p className="text-rally-danger text-sm mb-4 p-3 bg-rally-danger/10 rounded-lg">{error}</p>
      )}

      {testResults && (
        <section className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg text-sm">
          <p className="text-rally-muted text-xs mb-2">LAST TEST RESULTS</p>
          {testResults.map((r) => (
            <div key={r.subscriptionId} className="flex justify-between gap-2 py-1 text-xs">
              <span>
                {r.user} · {r.platform || "?"}
              </span>
              <span className={r.success ? "text-rally-success" : "text-rally-danger"}>
                {r.success ? "✓ delivered" : `✗ ${r.error || "failed"}`}
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="mb-6">
        <h2 className="text-rally-muted text-xs mb-2">SETUP CHECKLIST</h2>
        <div className="flex flex-col gap-3">
          {SETUP_STEPS.map((item) => {
            const count =
              item.platform === "Android"
                ? summary?.android ?? 0
                : item.platform === "iOS"
                  ? summary?.ios ?? 0
                  : summary?.desktop ?? 0;
            const done = count >= item.target;
            return (
              <div
                key={item.platform}
                className={`p-3 rounded-lg border ${
                  done
                    ? "bg-rally-success/10 border-rally-success/40"
                    : "bg-rally-surface border-rally-border"
                }`}
              >
                <p className="font-bold text-sm mb-1">
                  {done ? "✓" : "○"} {item.platform}
                  {"optional" in item && item.optional ? " (optional)" : ""} ({count}/{item.target})
                </p>
                <ol className="list-decimal list-inside text-rally-muted text-xs space-y-1">
                  {item.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      </section>

      <section className="p-4 mb-6 bg-rally-warning/10 border border-rally-warning/40 rounded-lg text-sm">
        <p className="text-rally-warning font-bold text-xs mb-2">NO APPLE DEVICE?</p>
        <p className="text-rally-muted text-xs mb-3">
          The iOS Simulator cannot receive push notifications. You need a real iPhone/iPad,
          or one of these workarounds:
        </p>
        <ul className="text-rally-muted text-xs space-y-2 mb-3 list-disc list-inside">
          <li>
            <strong className="text-rally-text">Ask a friend</strong> — create a test caller
            account, send them the invite below (easiest free option)
          </li>
          <li>
            <strong className="text-rally-text">Mac Safari PWA</strong> — if you have a Mac,
            install the site to your Dock (Safari → File → Add to Dock). Same WebKit engine,
            not identical to iPhone but catches many Safari-specific issues
          </li>
          <li>
            <strong className="text-rally-text">Cloud device farm</strong> — BrowserStack or
            LambdaTest give remote access to real iPhones (paid; manual PWA install still
            required)
          </li>
          <li>
            <strong className="text-rally-text">Android + web only</strong> — if both pass,
            your VAPID/service-worker stack is solid; iOS uses the same standard
          </li>
        </ul>
        <button
          onClick={copyIosInvite}
          className="w-full py-2 bg-rally-warning text-black text-xs font-bold rounded"
        >
          {copiedInvite ? "✓ COPIED iOS TESTER INVITE" : "COPY iOS TESTER INVITE"}
        </button>
        <p className="text-rally-muted text-xs mt-2">
          Paste into Discord/SMS, then send the test account username and password separately.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-rally-muted text-xs mb-2">REGISTERED DEVICES</h2>
        {!bench?.devices.length && (
          <p className="text-rally-muted text-sm text-center py-6">
            No devices registered yet. Create caller accounts in Users, then enable push on each
            device.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {bench?.devices.map((device) => (
            <div
              key={device.id}
              className="p-3 bg-rally-surface border border-rally-border rounded-lg"
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-sm">
                    {device.user.displayName}
                    <span className="text-rally-muted font-normal"> · {device.platform}</span>
                  </p>
                  <p className="text-rally-muted text-xs">@{device.user.username}</p>
                  <p className="text-rally-muted text-xs truncate mt-1">
                    {device.userAgent || "unknown browser"}
                  </p>
                  <p className="text-rally-accent text-xs mt-1">
                    Learned lead: {device.deliveryLeadMs ?? 1000}ms
                    {(device.deliverySampleCount ?? 0) > 0
                      ? ` (${device.deliverySampleCount} samples)`
                      : " (not calibrated yet)"}
                  </p>
                </div>
                <button
                  onClick={() => sendTest({ subscriptionId: device.id })}
                  disabled={testing !== null}
                  className="shrink-0 px-2 py-1 text-xs font-bold text-rally-accent border border-rally-accent rounded"
                >
                  {testing === device.id ? "..." : "Test"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="p-4 bg-rally-surface border border-rally-border rounded-lg text-sm">
        <p className="text-rally-muted text-xs mb-2">RALLY NOTIFICATION TEST</p>
        <ol className="list-decimal list-inside text-rally-muted text-xs space-y-1 mb-3">
          <li>Create a TEST RALLY template (10s gather) on Admin dashboard</li>
          <li>Add callers and link each to a test account with a registered device</li>
          <li>Press GO and verify RALLY_STARTED, optional warnings, and LAUNCH fire</li>
          <li>Test with app in foreground, background, and screen locked</li>
        </ol>
        <Link href="/admin" className="text-rally-accent text-xs font-bold">
          Open Admin Dashboard →
        </Link>
      </section>
    </main>
  );
}

function CountBadge({
  label,
  count,
  target,
}: {
  label: string;
  count: number;
  target: number;
}) {
  const met = count >= target;
  return (
    <div
      className={`p-2 rounded border ${
        met ? "border-rally-success/50 bg-rally-success/10" : "border-rally-border"
      }`}
    >
      <p className="text-rally-muted">{label}</p>
      <p className={`text-lg font-bold ${met ? "text-rally-success" : "text-rally-text"}`}>
        {count}/{target}
      </p>
    </div>
  );
}
