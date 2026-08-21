import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { formatCountdown } from "../lib/time";

const TICK_MS = 50;

export function useCountdown(
  rallyTimeMs: number | null,
  correctedNow: () => number
): { display: string; remainingMs: number; isNow: boolean } {
  const [display, setDisplay] = useState("--:--.---");
  const [remainingMs, setRemainingMs] = useState(0);
  const [isNow, setIsNow] = useState(false);

  useEffect(() => {
    if (rallyTimeMs === null) {
      setDisplay("--:--.---");
      setRemainingMs(0);
      setIsNow(false);
      return;
    }

    const tick = () => {
      const remaining = rallyTimeMs - correctedNow();
      setRemainingMs(remaining);

      if (remaining <= 0) {
        setDisplay("LAUNCH NOW");
        setIsNow(true);
      } else {
        setDisplay(formatCountdown(remaining));
        setIsNow(false);
      }
    };

    tick();
    const interval = setInterval(tick, TICK_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") tick();
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [rallyTimeMs, correctedNow]);

  return { display, remainingMs, isNow };
}
