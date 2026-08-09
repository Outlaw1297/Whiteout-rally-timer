"use client";

import { useCallback, useEffect, useState } from "react";
import { useServerClock } from "@/hooks/useServerClock";
import { useCountdown } from "@/hooks/useCountdown";
import { useRallySocket, type RallySocketData } from "@/hooks/useRallySocket";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { NotificationButton, CopyRallyLink } from "./NotificationButton";
import { getUserId } from "@/hooks/usePushNotifications";
import {
  formatTimeLocal,
  formatTimeWithMs,
  NOTIFICATION_OFFSETS,
  RALLY_STATUS_LABELS,
} from "@/lib/time";

interface RallyViewProps {
  rallyId: string;
  showDebug?: boolean;
}

export function RallyView({ rallyId, showDebug }: RallyViewProps) {
  const [rally, setRally] = useState<RallySocketData | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [startDelay, setStartDelay] = useState(30);
  const userId = getUserId();

  const isActive = rally?.status === "ACTIVE";
  const { isLive, correctedNow } = useServerClock({ activeRally: isActive });
  const rallyTimeMs = rally?.rallyTime ? new Date(rally.rallyTime).getTime() : null;
  const { display, isNow } = useCountdown(rallyTimeMs, correctedNow);

  const isController = rally?.createdBy === userId;
  const isReady = rally?.status === "READY";
  const isCancelled = rally?.cancelled || rally?.status === "CANCELLED";
  const isCompleted = rally?.status === "COMPLETED";

  const fetchRally = useCallback(async () => {
    try {
      const res = await fetch(`/api/rallies/${rallyId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Rally not found");
        return;
      }
      setRally(data);
    } catch {
      setError("Failed to load rally");
    }
  }, [rallyId]);

  useRallySocket({
    rallyId,
    onRallyUpdate: setRally,
    onRallyStarted: setRally,
    onRallyCancelled: () => fetchRally(),
  });

  useEffect(() => {
    fetchRally();
  }, [fetchRally]);

  const startRally = async () => {
    setStarting(true);
    try {
      const res = await fetch(`/api/rallies/${rallyId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delaySeconds: startDelay, controllerId: userId }),
      });
      const data = await res.json();
      if (res.ok) setRally(data.rally);
    } finally {
      setStarting(false);
    }
  };

  const cancelRally = async () => {
    if (!confirm("Cancel this rally?")) return;
    await fetch(`/api/rallies/${rallyId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controllerId: userId }),
    });
    fetchRally();
  };

  if (error) {
    return <div className="text-center text-rally-danger text-lg">{error}</div>;
  }

  if (!rally) {
    return <div className="text-center text-rally-muted text-lg">Loading rally...</div>;
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg">
      <h1 className="text-2xl font-bold text-rally-text uppercase tracking-widest text-center">
        {rally.title}
      </h1>

      <div className="text-center">
        <p className="text-rally-muted text-xs font-bold tracking-widest mb-1">
          RALLY STATUS
        </p>
        <p className="text-lg font-bold text-rally-accent">
          {RALLY_STATUS_LABELS[rally.status] || rally.status}
        </p>
      </div>

      {isCancelled ? (
        <p className="text-4xl font-bold text-rally-danger">CANCELLED</p>
      ) : isReady && isController ? (
        <ControllerReadyView
          startDelay={startDelay}
          onDelayChange={setStartDelay}
          onStart={startRally}
          onCancel={cancelRally}
          starting={starting}
        />
      ) : isReady ? (
        <ParticipantWaitingView />
      ) : (
        <LiveCountdownView
          display={display}
          isNow={isNow}
          rallyTime={rally.rallyTime}
          isCompleted={isCompleted}
        />
      )}

      <div className="w-full space-y-2 text-center text-sm">
        <div className="flex items-center justify-center gap-2">
          <span className="text-rally-muted">LIVE CONNECTION</span>
          <ConnectionIndicator isLive={isLive} />
        </div>
        <div className="flex items-center justify-center gap-2">
          <span className="text-rally-muted">SERVER SYNC</span>
          <span className={isLive ? "text-rally-success" : "text-rally-warning"}>
            {isLive ? "● SYNCED" : "○ RECONNECTING"}
          </span>
        </div>
      </div>

      {!isController && !isCancelled && <NotificationButton rallyId={rallyId} />}
      {isController && !isCancelled && <CopyRallyLink rallyId={rallyId} />}

      {isController && !isCancelled && !isReady && !isCompleted && (
        <button
          onClick={cancelRally}
          className="w-full py-3 px-4 bg-rally-surface border border-rally-danger text-rally-danger hover:bg-rally-danger hover:text-white text-sm font-bold rounded-lg"
        >
          CANCEL RALLY
        </button>
      )}

      {(showDebug || rally.isTestMode) && rally.rallyTime && (
        <DebugPanel rally={rally} />
      )}
    </div>
  );
}

function ControllerReadyView({
  startDelay,
  onDelayChange,
  onStart,
  onCancel,
  starting,
}: {
  startDelay: number;
  onDelayChange: (v: number) => void;
  onStart: () => void;
  onCancel: () => void;
  starting: boolean;
}) {
  return (
    <div className="w-full flex flex-col gap-4">
      <p className="text-rally-muted text-sm text-center">
        Press START when your alliance is ready. The server will set the official rally
        time.
      </p>

      <div>
        <p className="text-rally-muted text-xs font-bold mb-2 text-center">
          START COUNTDOWN IN
        </p>
        <div className="grid grid-cols-4 gap-2">
          {[5, 10, 30, 60].map((seconds) => (
            <button
              key={seconds}
              onClick={() => onDelayChange(seconds)}
              className={`py-2 text-sm font-bold rounded-lg border ${
                startDelay === seconds
                  ? "bg-rally-accent border-rally-accent text-white"
                  : "bg-rally-surface border-rally-border text-rally-muted"
              }`}
            >
              {seconds}s
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onStart}
        disabled={starting}
        className="w-full py-5 bg-rally-accent hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-2xl rounded-lg"
      >
        {starting ? "STARTING..." : "START RALLY"}
      </button>

      <button
        onClick={onCancel}
        className="w-full py-3 bg-rally-surface border border-rally-border text-rally-muted hover:text-rally-danger text-sm rounded-lg"
      >
        CANCEL
      </button>
    </div>
  );
}

function ParticipantWaitingView() {
  return (
    <div className="text-center py-8">
      <p className="text-rally-muted text-sm font-bold mb-2">WAITING FOR CONTROLLER</p>
      <p className="text-4xl font-mono text-rally-muted">--:--.---</p>
      <p className="text-rally-muted text-xs mt-4">
        Enable alerts below. You will be notified when the rally starts.
      </p>
    </div>
  );
}

function LiveCountdownView({
  display,
  isNow,
  rallyTime,
  isCompleted,
}: {
  display: string;
  isNow: boolean;
  rallyTime: string | null;
  isCompleted: boolean;
}) {
  return (
    <div className="text-center w-full">
      {!isNow && !isCompleted && (
        <p className="text-rally-muted text-sm font-bold tracking-widest mb-3">
          RALLY STARTS IN
        </p>
      )}
      <p
        className={`font-mono font-bold tracking-wider leading-none ${
          isNow || isCompleted
            ? "text-5xl text-rally-danger"
            : "text-7xl text-rally-accent"
        }`}
      >
        {isCompleted ? "🚨 RALLY NOW" : display}
      </p>
      {rallyTime && (
        <p className="text-rally-muted text-sm mt-6">
          START{" "}
          <span className="text-rally-text font-mono text-lg">
            {formatTimeLocal(new Date(rallyTime))}
          </span>
        </p>
      )}
    </div>
  );
}

function DebugPanel({ rally }: { rally: RallySocketData }) {
  if (!rally.rallyTime) return null;
  const rallyTimeMs = new Date(rally.rallyTime).getTime();

  const events = NOTIFICATION_OFFSETS.map((offset) => {
    const scheduledMs = rallyTimeMs - offset.seconds * 1000;
    const log = rally.notificationLogs?.find((l) => l.notificationType === offset.type);
    return { type: offset.type, scheduledAt: new Date(scheduledMs), log };
  });

  return (
    <div className="w-full p-4 bg-rally-surface border border-rally-warning rounded-lg overflow-x-auto">
      <h3 className="text-rally-warning font-bold text-sm mb-3">DEBUG PANEL</h3>
      <table className="w-full font-mono text-xs">
        <thead>
          <tr className="text-rally-muted text-left">
            <th className="pb-2">EVENT</th>
            <th className="pb-2">SCHEDULED</th>
            <th className="pb-2">SENT</th>
            <th className="pb-2">LATENCY</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.type} className="border-t border-rally-border">
              <td className="py-2 text-rally-text">{event.type}</td>
              <td className="py-2 text-rally-muted">
                {formatTimeWithMs(event.scheduledAt)}
              </td>
              <td className="py-2 text-rally-muted">
                {event.log?.sentAt
                  ? formatTimeWithMs(new Date(event.log.sentAt))
                  : "pending"}
              </td>
              <td
                className={`py-2 ${
                  event.log?.latencyMs && event.log.latencyMs > 1000
                    ? "text-rally-danger"
                    : "text-rally-success"
                }`}
              >
                {event.log?.latencyMs != null ? `+${event.log.latencyMs}ms` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-rally-muted text-xs mt-3">
        Server events are exact. Push delivery latency reflects Apple/network, not rally
        timing.
      </p>
    </div>
  );
}
