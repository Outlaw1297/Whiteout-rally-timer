"use client";

import { useSilentLivePing } from "@/hooks/useSilentLivePing";

/** Mounts the HTTP presence heartbeat and local subscription reconciliation. */
export function SilentLivePing() {
  useSilentLivePing(true);
  return null;
}
