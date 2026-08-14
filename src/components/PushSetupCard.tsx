"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Check, AlertTriangle } from "lucide-react";
import { NotificationButton } from "@/components/NotificationButton";
import { PushNotificationsProvider, usePushNotificationsContext } from "@/components/PushNotificationsProvider";
import { Panel, SectionLabel } from "@/components/ui/AppShell";

interface PushStatus {
  vapidConfigured: boolean;
  vapidError?: string | null;
  vapidSource?: string | null;
  autoManaged?: boolean;
  hasPublicKey?: boolean;
  hasPrivateKey?: boolean;
  deviceCount: number;
  devices: Array<{ id: string; platform: string }>;
}

function PushSetupCardInner({ onSubscribed }: { onSubscribed?: () => void }) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const { isSubscribed, thisDeviceRegistered, checkStatus, status: pushStatus } =
    usePushNotificationsContext();

  const refreshServer = useCallback(async () => {
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

  const refresh = useCallback(async () => {
    await checkStatus();
    await refreshServer();
  }, [checkStatus, refreshServer]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(refreshServer, 8000);
    return () => clearInterval(interval);
  }, [refreshServer]);

  if (loading && !status) {
    return <div className="text-rally-muted text-sm text-center py-4">Checking push setup...</div>;
  }

  const deviceOk = isSubscribed && thisDeviceRegistered;
  const otherDevices = (status?.deviceCount ?? 0) > 0 && !deviceOk;

  return (
    <Panel className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Bell className="h-4 w-4 text-rally-ice shrink-0" aria-hidden />
        <SectionLabel>Your Device Notifications</SectionLabel>
      </div>

      {!status?.vapidConfigured ? (
        <div className="text-rally-danger text-sm mb-3 space-y-1">
          <p className="font-semibold">Push not working on server</p>
          {status?.vapidError && <p className="text-xs">{status.vapidError}</p>}
          <p className="text-xs text-rally-muted mt-2">
            Keys are auto-generated on first run — redeploy if this persists.
          </p>
        </div>
      ) : (
        <p className="text-rally-muted text-xs mb-3">
          After a redeploy this page verifies whether <span className="font-semibold text-rally-snow">this browser</span>{" "}
          is still registered and repairs it when possible.
        </p>
      )}

      {deviceOk ? (
        <div className="mb-3 p-3 bg-rally-success/10 border border-rally-success/40 rounded-lg text-sm">
          <p className="text-rally-success font-semibold inline-flex items-center gap-1.5">
            <Check className="h-4 w-4" aria-hidden />
            This device is registered
          </p>
          <p className="text-rally-muted text-xs mt-1">
            {status?.deviceCount ?? 1} device{(status?.deviceCount ?? 1) !== 1 ? "s" : ""} on your
            account
            {status?.devices?.length
              ? ` · ${status.devices.map((d) => d.platform).join(", ")}`
              : ""}
          </p>
        </div>
      ) : pushStatus === "device-in-use" ? (
        <div className="mb-3 p-3 bg-rally-warning/10 border border-rally-warning/40 rounded-lg text-sm text-rally-warning">
          <p className="font-semibold inline-flex items-center gap-1.5">
            <BellOff className="h-4 w-4" aria-hidden />
            This device is set up for a different account
          </p>
          <p className="text-xs mt-1 text-rally-muted">
            Another account is currently receiving alerts on this browser. Tap Enable below to
            switch this device to your account.
          </p>
        </div>
      ) : otherDevices || pushStatus === "stale" ? (
        <div className="mb-3 p-3 bg-rally-warning/10 border border-rally-warning/40 rounded-lg text-sm text-rally-warning">
          <p className="font-semibold inline-flex items-center gap-1.5">
            <BellOff className="h-4 w-4" aria-hidden />
            This browser is not registered for alerts
          </p>
          <p className="text-xs mt-1 text-rally-muted">
            {otherDevices
              ? `Your account still has ${status?.deviceCount} saved device${
                  status?.deviceCount !== 1 ? "s" : ""
                }, but this browser lost its subscription (common after a redeploy). Tap Enable below to fix it.`
              : "Tap Enable below to register this device again."}
          </p>
        </div>
      ) : (
        <div className="mb-3 p-3 bg-rally-warning/10 border border-rally-warning/40 rounded-lg text-sm text-rally-warning inline-flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          No devices registered for your account yet.
        </div>
      )}

      <NotificationButton
        onStatusChange={() => {
          refresh();
          onSubscribed?.();
        }}
      />

      {onSubscribed && deviceOk && (
        <p className="text-rally-muted text-xs text-center mt-2">
          Linked caller slots will show this device after you link your account below.
        </p>
      )}
    </Panel>
  );
}

export function PushSetupCard({ onSubscribed }: { onSubscribed?: () => void }) {
  return (
    <PushNotificationsProvider>
      <PushSetupCardInner onSubscribed={onSubscribed} />
    </PushNotificationsProvider>
  );
}
