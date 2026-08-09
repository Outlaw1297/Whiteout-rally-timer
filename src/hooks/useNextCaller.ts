"use client";

import { useEffect, useMemo, useState } from "react";
import { getNextCaller, type NextCallerAssignment, type NextCallerInfo } from "@/lib/timing";

const TICK_MS = 100;

export function useNextCaller(
  assignments: NextCallerAssignment[] | undefined,
  correctedNow: () => number,
  active: boolean
): NextCallerInfo | null {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(interval);
  }, [active]);

  return useMemo(() => {
    if (!assignments || !active) return null;
    return getNextCaller(assignments, correctedNow());
    // tick drives recomputation as launch times pass
  }, [assignments, active, correctedNow, tick]);
}
