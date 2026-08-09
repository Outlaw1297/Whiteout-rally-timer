"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface SerializedEvent {
  id: string;
  name: string;
  targetArrivalTime: string | null;
  gatherDurationSeconds: number;
  status: string;
  isTestMode: boolean;
  isTemplate?: boolean;
  assignments: Array<{
    id: string;
    userId: string | null;
    displayName: string;
    marchDurationSeconds: number;
    marchFormatted: string;
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

  const callbacksRef = useRef({ onEventUpdate, onEventCancelled });
  callbacksRef.current = { onEventUpdate, onEventCancelled };

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({ type: "subscribe_rally", rallyId: eventId }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
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
      reconnectRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
  }, [eventId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { isConnected };
}
