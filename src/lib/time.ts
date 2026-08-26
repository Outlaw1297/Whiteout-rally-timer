/**
 * Web time helpers — shared clock/formatters live in @whiteout/shared.
 * Legacy T-30 notification types kept here for older code paths.
 */
export {
  calculateClockOffset,
  formatCountdown,
  formatTimeLocal,
} from "@whiteout/shared";

export interface ServerTimeResponse {
  serverTime: string;
  unixMs: number;
}

export function getServerTime(): ServerTimeResponse {
  const now = Date.now();
  return {
    serverTime: new Date(now).toISOString(),
    unixMs: now,
  };
}

export function estimateRoundTripLatency(
  clientSendTime: number,
  clientReceiveTime: number
): number {
  return clientReceiveTime - clientSendTime;
}

export function formatTimeWithMs(date: Date): string {
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${time}.${ms}`;
}

export const NOTIFICATION_OFFSETS = [
  { type: "T-30", seconds: 30, field: "notification30Sent" as const },
  { type: "T-10", seconds: 10, field: "notification10Sent" as const },
  { type: "T-5", seconds: 5, field: "notification5Sent" as const },
  { type: "T-1", seconds: 1, field: "notification1Sent" as const },
  { type: "T+0", seconds: 0, field: "notificationNowSent" as const },
] as const;

export type NotificationType = (typeof NOTIFICATION_OFFSETS)[number]["type"];
export type NotificationField = (typeof NOTIFICATION_OFFSETS)[number]["field"];

const NOTIFICATION_BODIES: Record<NotificationType, string> = {
  "T-30": "Rally in 30 seconds",
  "T-10": "Rally in 10 seconds",
  "T-5": "Rally in 5 seconds",
  "T-1": "Rally in 1 second",
  "T+0": "RALLY NOW",
};

export function getNotificationPayload(
  notificationType: NotificationType,
  rallyTitle: string
): { title: string; body: string } {
  const prefix = notificationType === "T+0" ? "🚨" : "⚔️";
  return {
    title: `${prefix} ${rallyTitle.toUpperCase()}`,
    body: NOTIFICATION_BODIES[notificationType],
  };
}

export function getScheduledNotificationTime(
  rallyTimeMs: number,
  secondsBefore: number
): number {
  return rallyTimeMs - secondsBefore * 1000;
}

export const RALLY_STATUS_LABELS: Record<string, string> = {
  DRAFT: "DRAFT",
  READY: "READY",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};
