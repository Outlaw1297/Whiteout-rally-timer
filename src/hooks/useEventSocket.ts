"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { clockSync } from "@/lib/clock-sync";

export interface SerializedEvent {
  id: string;
  name: string;
  targetArrivalTime: string | null;
  gatherDurationSeconds: number;
  firstCallerLeadSeconds?: number;
  pushLeadMs?: number;
  status: string;
  isTestMode: boolean;
  isTemplate?: boolean;
  pinned?: boolean;
  sortOrder?: number;
  assignments: Array<{
    id: string;
    userId: string | null;
    displayName: string;
    marchDurationSeconds: number;
    marchFormatted: string;
    arrivalOffsetSeconds?: number;
    launchTime: string | null;
    expectedArrivalTime: string | null;
    status: string;
    launchedConfirmedAt: string | null;
    hasPushAccount?: boolean;
  }>;
  nextCaller: { displayName: string; launchTime: string; assignmentId: string } | null;
  serverTime: { serverTime: string; unixMs: number };
}

interface UseEventSocketOptions {
  eventId: string;
  onEventUpdate?: (event: SerializedEvent) => void;
  onEventCancelled?: () => void;
}

export function useEventSocket({
  eventId,
  onEventUpdate,
  onEventCancelled,
}: UseEventSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendPing = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "ping", clientSendTime: Date.now() }));
  }, []);

  const handleTimeMessage = useCallback((data: Record<string, unknown>) => {
    if (
      data.type === "pong" &&
      typeof data.clientSendTime === "number" &&
      typeof data.serverReceiveTime === "number" &&
      typeof data.serverSendTime === "number"
    ) {
      clockSync.applyNtp(
        data.clientSendTime,
        data.serverReceiveTime,
        data.serverSendTime,
        Date.now()
      );
      return;
    }

    // Keepalive only — NTP pongs are authoritative. Skip unless the clock is stale,
    // and never treat main-thread delay as one-way flight (that snaps the countdown).
    if (data.type === "time_sync" && typeof data.serverTime === "number") {
      const last = clockSync.getLastSyncAt();
      const stale = !last || Date.now() - last > 10_000;
      if (!stale) return;
      const clientReceiveTime = Date.now();
      clockSync.applyUnixMs(data.serverTime, clientReceiveTime, clientReceiveTime);
    }
  }, []);

  const callbacksRef = useRef({ onEventUpdate, onEventCancelled });
  callbacksRef.current = { onEventUpdate, onEventCancelled };

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({ type: "subscribe_rally", rallyId: eventId }));
      sendPing();
      pingRef.current = setInterval(sendPing, 2000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleTimeMessage(data);
        if (data.rallyId && data.rallyId !== eventId) return;

        if (data.type === "rally_update" && data.rally) {
          callbacksRef.current.onEventUpdate?.(data.rally as SerializedEvent);
        } else if (data.type === "rally_cancelled") {
          callbacksRef.current.onEventCancelled?.();
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      if (pingRef.current) clearInterval(pingRef.current);
      reconnectRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
  }, [eventId, sendPing, handleTimeMessage]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (pingRef.current) clearInterval(pingRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { isConnected };
}
