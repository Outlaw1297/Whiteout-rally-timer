import type { Rally, NotificationLog } from "@prisma/client";
import { getServerTime } from "./time";

export const ALLOWED_START_DELAYS = [5, 10, 30, 60] as const;
export type StartDelay = (typeof ALLOWED_START_DELAYS)[number];

export const NOTIFICATION_RESET = {
  notification30Sent: false,
  notification10Sent: false,
  notification5Sent: false,
  notification1Sent: false,
  notificationNowSent: false,
} as const;

export function normalizeRallyStatus(status: string): string {
  return status === "SCHEDULED" ? "READY" : status;
}

export function serializeRally(
  rally: Rally & {
    notificationLogs?: NotificationLog[];
    _count?: { subscribers: number };
  }
) {
  return {
    id: rally.id,
    title: rally.title,
    rallyTime: rally.rallyTime?.toISOString() ?? null,
    status: normalizeRallyStatus(rally.status),
    cancelled: rally.cancelled,
    isTestMode: rally.isTestMode,
    createdBy: rally.createdBy,
    startedAt: rally.startedAt?.toISOString() ?? null,
    startDelaySeconds: rally.startDelaySeconds,
    createdAt: rally.createdAt.toISOString(),
    updatedAt: rally.updatedAt.toISOString(),
    subscriberCount: rally._count?.subscribers ?? undefined,
    notifications: {
      notification30Sent: rally.notification30Sent,
      notification10Sent: rally.notification10Sent,
      notification5Sent: rally.notification5Sent,
      notification1Sent: rally.notification1Sent,
      notificationNowSent: rally.notificationNowSent,
    },
    notificationLogs: rally.notificationLogs?.map((log) => ({
      notificationType: log.notificationType,
      scheduledAt: log.scheduledAt.toISOString(),
      sentAt: log.sentAt?.toISOString() ?? null,
      latencyMs: log.latencyMs,
      status: log.status,
      success: log.success,
      errorMessage: log.errorMessage,
    })),
    serverTime: getServerTime(),
  };
}

export function isController(rally: Rally, userId?: string | null): boolean {
  return !!userId && !!rally.createdBy && rally.createdBy === userId;
}

export function canStart(rally: Rally): boolean {
  const status = rally.status as string;
  const isReadyLike =
    status === "READY" || (status === "SCHEDULED" && rally.rallyTime === null);
  return !rally.cancelled && isReadyLike && rally.rallyTime === null;
}

export function canCancel(rally: Rally): boolean {
  return !rally.cancelled && rally.status !== "COMPLETED";
}
