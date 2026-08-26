import {
  type AllowedWarningLead,
  type NotificationOffsetType,
  SECONDS_BY_WARNING_TYPE,
  WARNING_TYPE_BY_SECONDS,
} from "./notification-prefs";
import { formatDurationSeconds, formatTimeLocal } from "./time";

export function getNotificationSecondsBefore(type: NotificationOffsetType): number {
  if (type === "RALLY_STARTED") return 0;
  if (type === "LAUNCH") return 0;
  return SECONDS_BY_WARNING_TYPE[type as keyof typeof SECONDS_BY_WARNING_TYPE] ?? 0;
}

/** Wall-clock moment the caller should experience this notification. */
export function getNotificationTargetAt(
  launchTime: Date,
  type: NotificationOffsetType,
  options: { startedAt?: Date | null } = {}
): Date {
  if (type === "RALLY_STARTED") {
    return options.startedAt ?? new Date();
  }
  const secondsBefore = getNotificationSecondsBefore(type);
  return new Date(launchTime.getTime() - secondsBefore * 1000);
}

/** Skip a warning if less than its lead time remains before launch. */
export function shouldSkipNotification(
  type: NotificationOffsetType,
  launchTime: Date,
  now: Date = new Date(),
  scheduledAt?: Date
): boolean {
  if (type === "LAUNCH" || type === "RALLY_STARTED") return false;
  if (scheduledAt && now.getTime() >= scheduledAt.getTime()) return false;
  const secondsUntilLaunch = (launchTime.getTime() - now.getTime()) / 1000;
  return secondsUntilLaunch < getNotificationSecondsBefore(type);
}

/**
 * Build the alert schedule for one caller.
 * LAUNCH is always included. Optional warnings come from warningLeads.
 *
 * For **local** OS alarms use `pushLeadMs: 0` so they fire at the ideal
 * wall-clock target. Server remote push uses a positive lead to offset delivery delay.
 */
export function getNotificationSchedule(
  launchTime: Date,
  warningLeads: AllowedWarningLead[],
  options: {
    referenceTime?: Date;
    pushLeadMs?: number;
    includeRallyStarted?: boolean;
    startedAt?: Date | null;
  } = {}
): Array<{ type: NotificationOffsetType; scheduledAt: Date }> {
  const referenceMs = (options.referenceTime ?? new Date()).getTime();
  const pushLeadMs = options.pushLeadMs ?? 0;
  const launchMs = launchTime.getTime();
  const secondsUntilLaunch = (launchMs - referenceMs) / 1000;

  const candidates: Array<{ type: NotificationOffsetType; secondsBefore: number }> = [];

  if (options.includeRallyStarted) {
    candidates.push({ type: "RALLY_STARTED", secondsBefore: -1 });
  }

  for (const lead of warningLeads) {
    candidates.push({ type: WARNING_TYPE_BY_SECONDS[lead], secondsBefore: lead });
  }

  candidates.push({ type: "LAUNCH", secondsBefore: 0 });

  return candidates
    .filter(({ type, secondsBefore }) => {
      if (type === "RALLY_STARTED") return true;
      return secondsBefore <= secondsUntilLaunch;
    })
    .map(({ type, secondsBefore }) => {
      if (type === "RALLY_STARTED") {
        const startMs = (options.startedAt ?? options.referenceTime ?? new Date()).getTime();
        return {
          type,
          scheduledAt: new Date(Math.max(startMs, referenceMs) - Math.min(pushLeadMs, 200)),
        };
      }
      const idealMs = launchMs - secondsBefore * 1000;
      const leadCapped = Math.min(pushLeadMs, Math.max(0, idealMs - referenceMs));
      return {
        type,
        scheduledAt: new Date(idealMs - leadCapped),
      };
    });
}

export function getNotificationPayload(
  type: NotificationOffsetType,
  eventName: string,
  callerName: string,
  targetArrival: Date,
  marchSeconds: number,
  gatherSeconds: number
): { title: string; body: string } {
  const march = formatDurationSeconds(marchSeconds);
  const gather = formatDurationSeconds(gatherSeconds);
  const arrival = formatTimeLocal(targetArrival);

  switch (type) {
    case "RALLY_STARTED":
      return {
        title: `▶ Rally Timer Started`,
        body: `${eventName}\n${callerName} — timers are live. Target: ${arrival}`,
      };
    case "WARNING_60":
      return {
        title: `60s — get ready to throw`,
        body: `${eventName} · ${callerName}`,
      };
    case "WARNING_30":
      return {
        title: `30s — rally coming up`,
        body: `${eventName} · ${callerName}`,
      };
    case "WARNING_15":
      return {
        title: `15s — prepare to throw`,
        body: `${eventName} · ${callerName}`,
      };
    case "WARNING_10":
      return {
        title: `10s — almost throw time`,
        body: `${eventName} · ${callerName}`,
      };
    case "WARNING_5":
      return {
        title: `5s — throw soon`,
        body: `${eventName} · ${callerName}`,
      };
    case "WARNING_3":
      return {
        title: `3s — throw NOW`,
        body: `${eventName} · ${callerName}`,
      };
    case "LAUNCH":
      return {
        title: `🚨 THROW RALLY NOW`,
        body: `${eventName}\nTarget: ${arrival}\nMarch: ${march} | Rally: ${gather}`,
      };
  }
}

/**
 * Dedup key shared by remote push and local OS alarms so only one banner shows
 * per assignment + notification type.
 */
export function notificationDedupeKey(
  assignmentId: string,
  type: string
): string {
  return `${assignmentId}:${type}`;
}
