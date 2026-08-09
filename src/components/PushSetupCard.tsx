"use client";

import { useCallback, useEffect, useState } from "react";
import { NotificationButton } from "@/components/NotificationButton";

interface PushStatus {
  vapidConfigured: boolean;
  vapidError?: string | null;
  hasPublicKey?: boolean;
  hasPrivateKey?: boolean;
  deviceCount: number;
  devices: Array<{ id: string; platform: string }>;
}

export function PushSetupCard({ onSubscribed }: { onSubscribed?: () => void }) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, healthRes] = await Promise.all([
        fetch("/api/push/status"),
        fetch("/api/push/health"),
      ]);
      if (statusRes.ok) {
        const data = await statusRes.json();
        if (healthRes.ok) {
          const health = await healthRes.json();
          setStatus({
            ...data,
            vapidConfigured: health.pushEnabled,
            vapidError: health.error || data.vapidError,
          });
        } else {
          setStatus(data);
        }
      } else if (healthRes.ok) {
        const health = await healthRes.json();
        setStatus({
          vapidConfigured: health.pushEnabled,
          vapidError: health.error,
          hasPublicKey: health.hasPublicKey,
          hasPrivateKey: health.hasPrivateKey,
          deviceCount: 0,
          devices: [],
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (loading && !status) {
    return <div className="text-rally-muted text-sm text-center py-4">Checking push setup...</div>;
  }

  return (
    <section className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg">
      <h2 className="text-rally-muted text-xs mb-2">YOUR DEVICE NOTIFICATIONS</h2>

      {!status?.vapidConfigured ? (
        <div className="text-rally-danger text-sm mb-3 space-y-1">
          <p className="font-bold">Push not working on server</p>
          {status?.vapidError && <p className="text-xs">{status.vapidError}</p>}
          {status?.hasPublicKey === false && (
            <p className="text-xs">VAPID_PUBLIC_KEY is not set in Render.</p>
          )}
          {status?.hasPrivateKey === false && (
            <p className="text-xs">VAPID_PRIVATE_KEY is not set in Render.</p>
          )}
          <p className="text-xs text-rally-muted mt-2">
            Run <span className="font-mono">npm run generate:vapid</span> locally, then paste
            both keys into Render (one line each, no spaces or quotes). Redeploy after saving.
          </p>
        </div>
      ) : (
        <p className="text-rally-muted text-xs mb-3">
          Install the app, then tap enable below. Each caller slot must also be linked to the
          account that will receive alerts on that device.
        </p>
      )}

      {status && status.deviceCount > 0 ? (
        <div className="mb-3 p-3 bg-rally-success/10 border border-rally-success/40 rounded-lg text-sm">
          <p className="text-rally-success font-bold">
            ✓ {status.deviceCount} device{status.deviceCount !== 1 ? "s" : ""} registered
          </p>
          <p className="text-rally-muted text-xs mt-1">
            {status.devices.map((d) => d.platform).join(", ")}
          </p>
        </div>
      ) : (
        <div className="mb-3 p-3 bg-rally-warning/10 border border-rally-warning/40 rounded-lg text-sm text-rally-warning">
          No devices registered for your account yet.
        </div>
      )}

      <NotificationButton onStatusChange={refresh} />

      {onSubscribed && status && status.deviceCount > 0 && (
        <p className="text-rally-muted text-xs text-center mt-2">
          Linked caller slots will show this device after you link your account below.
        </p>
      )}
    </section>
  );
}
