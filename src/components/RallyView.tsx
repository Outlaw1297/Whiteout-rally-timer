"use client";

import { useEffect, useState } from "react";
import { useServerClock } from "@/hooks/useServerClock";
import { useCountdown } from "@/hooks/useCountdown";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { NotificationButton, CopyRallyLink } from "./NotificationButton";
import { formatTimeLocal, formatTimeWithMs, NOTIFICATION_OFFSETS } from "@/lib/time";

interface RallyData {
  id: string;
  title: string;
  rallyTime: string;
  status: string;
  cancelled: boolean;
  isTestMode: boolean;
  notificationLogs: Array<{
    notificationType: string;
    scheduledAt: string;
    sentAt: string | null;
    latencyMs: number | null;
    success: boolean;
  }>;
}

interface RallyViewProps {
  rallyId: string;
  showDebug?: boolean;
}

export function RallyView({ rallyId, showDebug }: RallyViewProps) {
  const { isLive, correctedNow } = useServerClock();
  const [rally, setRally] = useState<RallyData | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editTime, setEditTime] = useState("");

  const rallyTimeMs = rally ? new Date(rally.rallyTime).getTime() : null;
  const { display, isNow } = useCountdown(rallyTimeMs, correctedNow);

  const fetchRally = async () => {
    try {
      const res = await fetch(`/api/rallies/${rallyId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Rally not found");
        return;
      }
      setRally(data);
      setEditTitle(data.title);
      const rt = new Date(data.rallyTime);
      setEditTime(rt.toISOString().slice(0, 16));
    } catch {
      setError("Failed to load rally");
    }
  };

  useEffect(() => {
    fetchRally();
    const interval = setInterval(fetchRally, 5000);
    return () => clearInterval(interval);
  }, [rallyId]);

  const cancelRally = async () => {
    if (!confirm("Cancel this rally?")) return;
    await fetch(`/api/rallies/${rallyId}`, { method: "DELETE" });
    fetchRally();
  };

  const saveEdit = async () => {
    const res = await fetch(`/api/rallies/${rallyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle,
        rallyTime: new Date(editTime).toISOString(),
      }),
    });
    if (res.ok) {
      setEditing(false);
      fetchRally();
    }
  };

  if (error) {
    return (
      <div className="text-center text-rally-danger text-lg">{error}</div>
    );
  }

  if (!rally) {
    return (
      <div className="text-center text-rally-muted text-lg">Loading rally...</div>
    );
  }

  const rallyDate = new Date(rally.rallyTime);
  const serverNow = new Date(correctedNow());

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-lg">
      <h1 className="text-3xl font-bold text-rally-text uppercase tracking-wide text-center">
        {rally.title}
      </h1>

      {rally.cancelled ? (
        <div className="text-rally-danger text-2xl font-bold">CANCELLED</div>
      ) : (
        <>
          <div className="text-center">
            <p className="text-rally-muted text-sm font-bold mb-2">
              {isNow ? "" : "STARTING IN"}
            </p>
            <p
              className={`font-mono font-bold tracking-wider ${
                isNow
                  ? "text-5xl text-rally-danger"
                  : "text-6xl text-rally-accent"
              }`}
            >
              {display}
            </p>
          </div>

          <div className="w-full space-y-3 text-center">
            <div>
              <span className="text-rally-muted text-sm">START: </span>
              <span className="text-rally-text font-mono text-lg">
                {formatTimeLocal(rallyDate)}
              </span>
            </div>
            <div>
              <span className="text-rally-muted text-sm">UTC: </span>
              <span className="text-rally-muted font-mono text-sm">
                {rally.rallyTime}
              </span>
            </div>
            <div className="flex items-center justify-center gap-4">
              <div>
                <span className="text-rally-muted text-sm">STATUS: </span>
                <ConnectionIndicator isLive={isLive} />
              </div>
            </div>
            <div>
              <span className="text-rally-muted text-sm">SERVER TIME: </span>
              <span className="text-rally-muted font-mono text-sm">
                {formatTimeWithMs(serverNow)}
              </span>
            </div>
          </div>
        </>
      )}

      <NotificationButton rallyId={rallyId} />
      <CopyRallyLink rallyId={rallyId} />

      {!rally.cancelled && rallyTimeMs && rallyTimeMs > Date.now() && (
        <div className="flex gap-3 w-full">
          <button
            onClick={() => setEditing(!editing)}
            className="flex-1 py-3 px-4 bg-rally-surface border border-rally-border text-rally-muted hover:text-rally-text text-sm rounded-lg"
          >
            EDIT
          </button>
          <button
            onClick={cancelRally}
            className="flex-1 py-3 px-4 bg-rally-surface border border-rally-danger text-rally-danger hover:bg-rally-danger hover:text-white text-sm rounded-lg"
          >
            CANCEL
          </button>
        </div>
      )}

      {editing && (
        <div className="w-full space-y-3 p-4 bg-rally-surface border border-rally-border rounded-lg">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full py-3 px-4 bg-rally-bg border border-rally-border rounded-lg text-rally-text"
          />
          <input
            type="datetime-local"
            value={editTime}
            onChange={(e) => setEditTime(e.target.value)}
            className="w-full py-3 px-4 bg-rally-bg border border-rally-border rounded-lg text-rally-text"
          />
          <button
            onClick={saveEdit}
            className="w-full py-3 bg-rally-accent text-white font-bold rounded-lg"
          >
            SAVE CHANGES
          </button>
        </div>
      )}

      {(showDebug || rally.isTestMode) && (
        <DebugPanel rally={rally} />
      )}
    </div>
  );
}

function DebugPanel({ rally }: { rally: RallyData }) {
  const rallyTimeMs = new Date(rally.rallyTime).getTime();

  const scheduledEvents = NOTIFICATION_OFFSETS.map((offset) => {
    const scheduledMs = rallyTimeMs - offset.seconds * 1000;
    const log = rally.notificationLogs.find(
      (l) => l.notificationType === offset.type
    );
    return {
      type: offset.type,
      scheduledAt: new Date(scheduledMs),
      log,
    };
  });

  return (
    <div className="w-full p-4 bg-rally-surface border border-rally-warning rounded-lg">
      <h3 className="text-rally-warning font-bold text-sm mb-4">DEBUG PANEL</h3>
      <div className="font-mono text-xs space-y-2">
        <div className="text-rally-muted">
          Rally Time: {formatTimeWithMs(new Date(rally.rallyTime))}
        </div>
        {scheduledEvents.map((event) => (
          <div key={event.type} className="border-t border-rally-border pt-2">
            <div className="text-rally-text">{event.type}</div>
            <div className="text-rally-muted">
              scheduled: {formatTimeWithMs(event.scheduledAt)}
            </div>
            {event.log?.sentAt && (
              <>
                <div className="text-rally-muted">
                  sent: {formatTimeWithMs(new Date(event.log.sentAt))}
                </div>
                <div
                  className={
                    event.log.latencyMs && event.log.latencyMs > 1000
                      ? "text-rally-danger"
                      : "text-rally-success"
                  }
                >
                  latency: {event.log.latencyMs !== null ? `+${event.log.latencyMs}ms` : "—"}
                </div>
              </>
            )}
            {!event.log?.sentAt && (
              <div className="text-rally-muted">sent: pending</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
