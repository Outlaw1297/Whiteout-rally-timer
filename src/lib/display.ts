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
      return "Launched";
    case "WAITING":
      return "Waiting";
    case "MISSED":
      return "Missed";
    case "ACTIVE":
      return "Active";
    case "READY":
      return "Ready";
    case "DRAFT":
      return "Draft";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}
