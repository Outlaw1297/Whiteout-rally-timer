"use client";

import { useEffect, useRef, useState } from "react";
import { formatCountdown } from "@/lib/time";

export function useCountdown(
  rallyTimeMs: number | null,
  correctedNow: () => number
): { display: string; remainingMs: number; isNow: boolean } {
  const [display, setDisplay] = useState("--:--.---");
  const [remainingMs, setRemainingMs] = useState(0);
  const [isNow, setIsNow] = useState(false);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (rallyTimeMs === null) return;

    const tick = () => {
      const now = correctedNow();
      const remaining = rallyTimeMs - now;
      setRemainingMs(remaining);

      if (remaining <= 0) {
        setDisplay("RALLY NOW");
        setIsNow(true);
      } else {
        setDisplay(formatCountdown(remaining));
        setIsNow(false);
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [rallyTimeMs, correctedNow]);

  return { display, remainingMs, isNow };
}
