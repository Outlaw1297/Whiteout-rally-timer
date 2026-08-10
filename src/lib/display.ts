import { formatGatherDuration, formatMarchDuration } from "./timing";
import { formatTimeLocal } from "./time";

export function formatArrivalTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatTimeLocal(new Date(iso));
}

/** Format rally (gather) duration for display. */
export function formatGather(seconds: number): string {
  return formatGatherDuration(seconds);
}

export function formatRallyTime(seconds: number): string {
  return formatGatherDuration(seconds);
}

export function formatMarch(seconds: number): string {
  return formatMarchDuration(seconds);
}

export function statusLabel(status: string): string {
  switch (status) {
    case "LAUNCHED":
      return "✓ LAUNCHED";
    case "WAITING":
      return "WAITING";
    case "MISSED":
      return "MISSED";
    case "ACTIVE":
      return "ACTIVE";
    case "READY":
      return "READY";
    case "DRAFT":
      return "DRAFT";
    case "COMPLETED":
      return "COMPLETED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return status;
  }
}
