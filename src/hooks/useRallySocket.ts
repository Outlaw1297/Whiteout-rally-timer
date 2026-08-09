"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface RallySocketData {
  id: string;
  title: string;
  rallyTime: string | null;
  status: string;
  cancelled: boolean;
  isTestMode: boolean;
  createdBy: string | null;
  notificationLogs?: Array<{
    notificationType: string;
    scheduledAt: string;
    sentAt: string | null;
    latencyMs: number | null;
    status: string;
    success: boolean;
  }>;
}

interface UseRallySocketOptions {
  rallyId: string;
  onRallyUpdate?: (rally: RallySocketData) => void;
  onRallyStarted?: (rally: RallySocketData) => void;
  onRallyCancelled?: () => void;
}

export function useRallySocket({
  rallyId,
  onRallyUpdate,
  onRallyStarted,
  onRallyCancelled,
}: UseRallySocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callbacksRef = useRef({ onRallyUpdate, onRallyStarted, onRallyCancelled });
  callbacksRef.current = { onRallyUpdate, onRallyStarted, onRallyCancelled };

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({ type: "subscribe_rally", rallyId }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.rallyId && data.rallyId !== rallyId) return;

        if (data.type === "rally_update" && data.rally) {
          callbacksRef.current.onRallyUpdate?.(data.rally);
        } else if (data.type === "rally_started" && data.rally) {
          callbacksRef.current.onRallyStarted?.(data.rally);
        } else if (data.type === "rally_cancelled") {
          callbacksRef.current.onRallyCancelled?.();
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
  }, [rallyId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { isConnected };
}
