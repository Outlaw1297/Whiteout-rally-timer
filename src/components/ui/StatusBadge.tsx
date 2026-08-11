import type { ReactNode } from "react";

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "live"
  | "launch";

const toneClass: Record<StatusTone, string> = {
  neutral: "bg-rally-surface-2 text-rally-muted border-rally-border",
  info: "bg-rally-ice/10 text-rally-ice border-rally-ice/40",
  success: "bg-rally-success/15 text-rally-success border-rally-success/45",
  warning: "bg-rally-warning/15 text-rally-warning border-rally-warning/45",
  danger: "bg-rally-danger/15 text-rally-danger border-rally-danger/45",
  live: "bg-rally-success/15 text-rally-success border-rally-success/50",
  launch: "bg-rally-launch/20 text-rally-launch border-rally-launch/60",
};

export function StatusBadge({
  tone = "neutral",
  children,
  pulse = false,
  className = "",
}: {
  tone?: StatusTone;
  children: ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${toneClass[tone]} ${
        pulse ? "motion-safe:animate-launch-pulse" : ""
      } ${className}`}
    >
      {children}
    </span>
  );
}

export function statusToneForEvent(status: string): StatusTone {
  switch (status) {
    case "ACTIVE":
      return "live";
    case "READY":
      return "warning";
    case "COMPLETED":
      return "neutral";
    case "CANCELLED":
      return "danger";
    default:
      return "info";
  }
}

export function statusToneForAssignment(status: string, isNow?: boolean): StatusTone {
  if (isNow) return "launch";
  switch (status) {
    case "LAUNCHED":
      return "success";
    case "MISSED":
      return "danger";
    case "WAITING":
      return "info";
    default:
      return "neutral";
  }
}
