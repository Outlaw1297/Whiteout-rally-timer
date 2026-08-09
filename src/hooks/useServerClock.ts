"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { calculateClockOffset, estimateRoundTripLatency } from "@/lib/time";

interface UseServerClockOptions {
  syncIntervalMs?: number;
  useWebSocket?: boolean;
  activeRally?: boolean;
}

interface ServerClockState {
  offset: number;
  rtt: number;
  isLive: boolean;
  lastSyncAt: number | null;
  correctedNow: () => number;
  sync: () => Promise<void>;
}

export function useServerClock(options: UseServerClockOptions = {}): ServerClockState {
  const {
    syncIntervalMs = 30_000,
    useWebSocket = true,
    activeRally = false,
  } = options;

  const effectiveSyncInterval = activeRally ? 5_000 : syncIntervalMs;

  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);
  const [rtt, setRtt] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHttpSyncRef = useRef(0);

  const applyOffset = useCallback((newOffset: number, newRtt: number) => {
    offsetRef.current = newOffset;
    setOffset(newOffset);
    setRtt(newRtt);
    setLastSyncAt(Date.now());
  }, []);

  const sync = useCallback(async () => {
    const clientSendTime = Date.now();
    try {
      const res = await fetch("/api/time", {
        headers: { "x-client-send-time": String(clientSendTime) },
        cache: "no-store",
      });
      const clientReceiveTime = Date.now();
      const data = await res.json();

      if (data.serverReceiveTime && data.serverSendTime) {
        const newOffset = calculateClockOffset(
          clientSendTime,
          data.serverReceiveTime,
          data.serverSendTime,
          clientReceiveTime
        );
        applyOffset(newOffset, estimateRoundTripLatency(clientSendTime, clientReceiveTime));
        lastHttpSyncRef.current = Date.now();
      } else if (data.unixMs) {
        applyOffset(
          data.unixMs - clientReceiveTime,
          estimateRoundTripLatency(clientSendTime, clientReceiveTime)
        );
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
          const wsOffset = data.serverTime - clientReceiveTime;

          // Blend WS offset with HTTP NTP offset when HTTP sync is recent
          if (Date.now() - lastHttpSyncRef.current < 10_000) {
            applyOffset(
              offsetRef.current * 0.7 + wsOffset * 0.3,
              estimateRoundTripLatency(clientReceiveTime - 500, clientReceiveTime)
            );
          } else {
            applyOffset(wsOffset, 0);
          }
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
    const interval = setInterval(sync, effectiveSyncInterval);
    connectWebSocket();

    return () => {
      clearInterval(interval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [sync, effectiveSyncInterval, connectWebSocket]);

  const correctedNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { offset, rtt, isLive, lastSyncAt, correctedNow, sync };
}
