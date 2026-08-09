import { formatGatherDuration, formatMarchDuration } from "./timing";
import { formatTimeLocal } from "./time";

export function formatArrivalTime(iso: string): string {
  return formatTimeLocal(new Date(iso));
}

export function formatGather(seconds: number): string {
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
