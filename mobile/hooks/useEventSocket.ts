import { useCallback, useEffect, useRef, useState } from "react";
import { clockSync } from "../lib/clock-sync";
import { getWsUrl } from "../lib/config";
import type { SerializedEvent } from "../lib/types";

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
  const callbacksRef = useRef({ onEventUpdate, onEventCancelled });
  callbacksRef.current = { onEventUpdate, onEventCancelled };

  const sendPing = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "ping", clientSendTime: Date.now() }));
  }, []);

  const connect = useCallback(() => {
    if (!eventId) return;
    try {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        ws.send(JSON.stringify({ type: "subscribe_rally", rallyId: eventId }));
        sendPing();
        pingRef.current = setInterval(sendPing, 2000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as Record<string, unknown>;
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
          if (data.type === "time_sync" && typeof data.serverTime === "number") {
            const last = clockSync.getLastSyncAt();
            const stale = !last || Date.now() - last > 10_000;
            if (!stale) return;
            const clientReceiveTime = Date.now();
            clockSync.applyUnixMs(data.serverTime, clientReceiveTime, clientReceiveTime);
            return;
          }
          if (
            (data.type === "rally_update" || data.type === "rally_started") &&
            data.rally
          ) {
            callbacksRef.current.onEventUpdate?.(data.rally as SerializedEvent);
          }
          if (data.type === "rally_cancelled") {
            callbacksRef.current.onEventCancelled?.();
          }
        } catch {
          // ignore malformed
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (pingRef.current) clearInterval(pingRef.current);
        reconnectRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      reconnectRef.current = setTimeout(connect, 3000);
    }
  }, [eventId, sendPing]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (pingRef.current) clearInterval(pingRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { isConnected };
}
