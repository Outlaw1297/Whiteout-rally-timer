"use client";

import { useEffect, useMemo, useState } from "react";
import { getNextCaller, type NextCallerAssignment, type NextCallerInfo } from "@/lib/timing";

export function useNextCaller(
  assignments: NextCallerAssignment[] | undefined,
  correctedNow: () => number,
  active: boolean
): NextCallerInfo | null {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;

    let raf = 0;
    const loop = () => {
      setTick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(raf);
  }, [active]);

  return useMemo(() => {
    if (!assignments || !active) return null;
    return getNextCaller(assignments, correctedNow());
    // tick drives recomputation as launch times pass
  }, [assignments, active, correctedNow, tick]);
}
