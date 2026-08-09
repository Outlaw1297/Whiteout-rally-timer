"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { calculateClockOffset } from "@/lib/time";

interface UseServerClockOptions {
  syncIntervalMs?: number;
  useWebSocket?: boolean;
}

interface ServerClockState {
  offset: number;
  isLive: boolean;
  lastSyncAt: number | null;
  correctedNow: () => number;
  sync: () => Promise<void>;
}

export function useServerClock(options: UseServerClockOptions = {}): ServerClockState {
  const { syncIntervalMs = 30_000, useWebSocket = true } = options;
  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyOffset = useCallback((newOffset: number) => {
    offsetRef.current = newOffset;
    setOffset(newOffset);
    setLastSyncAt(Date.now());
  }, []);

  const sync = useCallback(async () => {
    const clientSendTime = Date.now();
    try {
      const res = await fetch("/api/time", {
        headers: { "x-client-send-time": String(clientSendTime) },
      });
      const clientReceiveTime = Date.now();
      const data = await res.json();

      if (data.offset !== undefined) {
        applyOffset(data.offset);
      } else if (data.unixMs) {
        const newOffset = calculateClockOffset(
          clientSendTime,
          data.serverReceiveTime || data.unixMs,
          data.serverSendTime || data.unixMs,
          clientReceiveTime
        );
        applyOffset(newOffset);
      }
    } catch {
      // keep last known offset
    }
  }, [applyOffset]);

  const connectWebSocket = useCallback(() => {
    if (!useWebSocket) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setIsLive(true);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "time_sync" && typeof data.serverTime === "number") {
          const clientReceiveTime = Date.now();
          const newOffset = data.serverTime - clientReceiveTime;
          applyOffset(newOffset);
          setIsLive(true);
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      setIsLive(false);
      wsRef.current = null;
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [useWebSocket, applyOffset]);

  useEffect(() => {
    sync();
    const interval = setInterval(sync, syncIntervalMs);
    connectWebSocket();

    return () => {
      clearInterval(interval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [sync, syncIntervalMs, connectWebSocket]);

  const correctedNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { offset, isLive, lastSyncAt, correctedNow, sync };
}
