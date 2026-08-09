"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { clockSync } from "@/lib/clock-sync";

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

function subscribe(callback: () => void) {
  return clockSync.subscribe(callback);
}

function getSnapshot() {
  return clockSync.getLastSyncAt();
}

export function useServerClock(options: UseServerClockOptions = {}): ServerClockState {
  const {
    syncIntervalMs = 30_000,
    useWebSocket = true,
    activeRally = false,
  } = options;

  const effectiveSyncInterval = activeRally ? 2_000 : syncIntervalMs;
  const wsPingInterval = activeRally ? 2_000 : 5_000;

  const [offset, setOffset] = useState(clockSync.getOffset());
  const [rtt, setRtt] = useState(clockSync.getRtt());
  const [isLive, setIsLive] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refreshState = useCallback(() => {
    setOffset(clockSync.getOffset());
    setRtt(clockSync.getRtt());
    setIsLive(true);
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
        clockSync.applyNtp(
          clientSendTime,
          data.serverReceiveTime,
          data.serverSendTime,
          clientReceiveTime
        );
      } else if (data.unixMs) {
        clockSync.applyUnixMs(data.unixMs, clientReceiveTime, clientSendTime);
      }
      refreshState();
    } catch {
      // keep last known anchor
    }
  }, [refreshState]);

  const sendWsPing = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "ping", clientSendTime: Date.now() }));
  }, []);

  const handleWsMessage = useCallback(
    (raw: string) => {
      try {
        const data = JSON.parse(raw);

        if (
          data.type === "pong" &&
          typeof data.clientSendTime === "number" &&
          typeof data.serverReceiveTime === "number" &&
          typeof data.serverSendTime === "number"
        ) {
          const clientReceiveTime = Date.now();
          clockSync.applyNtp(
            data.clientSendTime,
            data.serverReceiveTime,
            data.serverSendTime,
            clientReceiveTime
          );
          refreshState();
          return;
        }

        // Server push keepalive — only nudge if we have not synced recently.
        if (data.type === "time_sync" && typeof data.serverTime === "number") {
          const stale = !clockSync.getLastSyncAt() || Date.now() - clockSync.getLastSyncAt()! > 10_000;
          if (stale) {
            const clientReceiveTime = Date.now();
            const flightMs = Math.max(0, clientReceiveTime - data.serverTime);
            clockSync.applyUnixMs(
              data.serverTime + flightMs,
              clientReceiveTime,
              clientReceiveTime
            );
            refreshState();
          }
          setIsLive(true);
        }
      } catch {
        // ignore malformed messages
      }
    },
    [refreshState]
  );

  const connectWebSocket = useCallback(() => {
    if (!useWebSocket) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsLive(true);
      sendWsPing();
    };

    ws.onmessage = (event) => handleWsMessage(event.data);

    ws.onclose = () => {
      setIsLive(false);
      wsRef.current = null;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = () => ws.close();
  }, [useWebSocket, handleWsMessage, sendWsPing]);

  useEffect(() => {
    const unsub = clockSync.subscribe(refreshState);
    return unsub;
  }, [refreshState]);

  useEffect(() => {
    sync();
    const interval = setInterval(sync, effectiveSyncInterval);

    if (useWebSocket) {
      connectWebSocket();
      pingIntervalRef.current = setInterval(sendWsPing, wsPingInterval);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      document.removeEventListener("visibilitychange", onVisible);
      wsRef.current?.close();
    };
  }, [sync, effectiveSyncInterval, wsPingInterval, useWebSocket, connectWebSocket, sendWsPing]);

  const correctedNow = useCallback(() => clockSync.correctedNow(), []);

  return {
    offset,
    rtt,
    isLive,
    lastSyncAt: clockSync.getLastSyncAt(),
    correctedNow,
    sync,
  };
}
