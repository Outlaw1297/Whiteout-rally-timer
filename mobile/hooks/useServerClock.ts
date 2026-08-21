import { useCallback, useEffect, useState } from "react";
import { clockSync } from "../lib/clock-sync";
import { apiFetch } from "../lib/api";

export function useServerClock() {
  const [, setTick] = useState(0);

  useEffect(() => {
    return clockSync.subscribe(() => setTick((n) => n + 1));
  }, []);

  const syncHttp = useCallback(async () => {
    const clientSendTime = Date.now();
    try {
      const data = await apiFetch<{ unixMs: number }>("/api/time", {
        headers: { "x-client-send-time": String(clientSendTime) },
      });
      const clientReceiveTime = Date.now();
      clockSync.applyUnixMs(data.unixMs, clientReceiveTime, clientSendTime);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    syncHttp();
    const t = setInterval(syncHttp, 15_000);
    return () => clearInterval(t);
  }, [syncHttp]);

  return { correctedNow: clockSync.correctedNow, syncHttp };
}
