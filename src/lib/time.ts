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

/**
 * NTP-style offset calculation.
 * Positive offset means server is ahead of client.
 */
export function calculateClockOffset(
  clientSendTime: number,
  serverReceiveTime: number,
  serverSendTime: number,
  clientReceiveTime: number
): number {
  const offset =
    (serverReceiveTime - clientSendTime + (serverSendTime - clientReceiveTime)) / 2;
  return offset;
}

export function getCorrectedServerTime(offsetMs: number): number {
  return Date.now() + offsetMs;
}

export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "RALLY NOW";

  const totalSeconds = remainingMs / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.floor(remainingMs % 1000);

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function formatTimeLocal(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
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

export const NOTIFICATION_MESSAGES: Record<NotificationType, string> = {
  "T-30": "⚔️ Rally in 30 seconds",
  "T-10": "⚔️ Rally in 10 seconds",
  "T-5": "⚔️ Rally in 5 seconds",
  "T-1": "⚔️ RALLY IN 1 SECOND",
  "T+0": "⚔️ RALLY NOW",
};

export function getScheduledNotificationTime(
  rallyTimeMs: number,
  secondsBefore: number
): number {
  return rallyTimeMs - secondsBefore * 1000;
}
