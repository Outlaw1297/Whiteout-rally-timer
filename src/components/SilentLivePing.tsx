"use client";

import { useSilentLivePing } from "@/hooks/useSilentLivePing";

/** Mounts silent live timing pings when the user has push enabled and no timers are active. */
export function SilentLivePing() {
  useSilentLivePing(true);
  return null;
}
