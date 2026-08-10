import type { NotificationOffsetType } from "./notification-prefs";
import {
  WARNING_TYPE_BY_SECONDS,
  SECONDS_BY_WARNING_TYPE,
  type AllowedWarningLead,
} from "./notification-prefs";

export type { NotificationOffsetType } from "./notification-prefs";

/** Default gather duration: 5 minutes */
export const DEFAULT_GATHER_SECONDS = 300;

/** Default lead time before first caller launches after GO */
export const DEFAULT_FIRST_CALLER_LEAD_SECONDS = 3;

/** Default ms to send push early to offset network/OS delivery delay */
export const DEFAULT_PUSH_LEAD_MS = 1000;

/**
 * launchTime = targetArrivalTime + arrivalOffset - gather - march
 * Offset 0 = hit at shared target; positive = arrive later (stagger order).
 */
export function calculateLaunchTime(
  targetArrivalTime: Date,
  gatherDurationSeconds: number,
  marchDurationSeconds: number,
  arrivalOffsetSeconds = 0
): Date {
  const offsetMs =
    (gatherDurationSeconds + marchDurationSeconds - arrivalOffsetSeconds) * 1000;
  return new Date(targetArrivalTime.getTime() - offsetMs);
}

export function calculateExpectedArrival(
  launchTime: Date,
  gatherDurationSeconds: number,
  marchDurationSeconds: number
): Date {
  const offsetMs = (gatherDurationSeconds + marchDurationSeconds) * 1000;
  return new Date(launchTime.getTime() + offsetMs);
}

export function calculateEffectiveArrival(
  targetArrivalTime: Date,
  arrivalOffsetSeconds = 0
): Date {
  return new Date(targetArrivalTime.getTime() + arrivalOffsetSeconds * 1000);
}

/**
 * When GO is pressed: choose a shared target so the earliest launch is
 * startedAt + firstCallerLead, accounting for per-caller arrival offsets.
 *
 * For each caller: launch = target + offset - gather - march
 * ⇒ target = startedAt + lead + gather + max(march - offset)
 */
export function computeTargetArrivalOnGo(
  startedAt: Date,
  gatherDurationSeconds: number,
  marchDurationsSeconds: number[],
  firstCallerLeadSeconds = DEFAULT_FIRST_CALLER_LEAD_SECONDS,
  arrivalOffsetsSeconds: number[] = []
): Date {
  if (marchDurationsSeconds.length === 0) {
    return new Date(
      startedAt.getTime() + (gatherDurationSeconds + firstCallerLeadSeconds) * 1000
    );
  }

  let maxAdjustedMarch = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < marchDurationsSeconds.length; i++) {
    const offset = arrivalOffsetsSeconds[i] ?? 0;
    maxAdjustedMarch = Math.max(maxAdjustedMarch, marchDurationsSeconds[i] - offset);
  }

  return new Date(
    startedAt.getTime() +
      (gatherDurationSeconds + maxAdjustedMarch + firstCallerLeadSeconds) * 1000
  );
}

/** Parse "8:00", "6:30", "4:15", "12:37" → seconds */
export function parseMarchDuration(input: string): number | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  if (seconds >= 60) return null;
  return minutes * 60 + seconds;
}

/** Format seconds as M:SS e.g. 480 → "8:00" */
export function formatMarchDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format gather duration e.g. 300 → "5:00" */
export function formatGatherDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function parseGatherDuration(input: string): number | null {
  return parseMarchDuration(input);
}

export const NOTIFICATION_OFFSETS = [
  { type: "RALLY_STARTED" as const, secondsBefore: -1 },
  { type: "WARNING_60" as const, secondsBefore: 60 },
  { type: "WARNING_30" as const, secondsBefore: 30 },
  { type: "WARNING_15" as const, secondsBefore: 15 },
  { type: "WARNING_10" as const, secondsBefore: 10 },
  { type: "WARNING_5" as const, secondsBefore: 5 },
  { type: "WARNING_3" as const, secondsBefore: 3 },
  { type: "LAUNCH" as const, secondsBefore: 0 },
];

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

/** Skip a warning if less than its lead time remains before launch (applies to every caller). */
export function shouldSkipNotification(
  type: NotificationOffsetType,
  launchTime: Date,
  now: Date = new Date(),
  scheduledAt?: Date
): boolean {
  if (type === "LAUNCH" || type === "RALLY_STARTED") return false;
  // Honor the built schedule once the send time arrives, even if slightly late.
  if (scheduledAt && now.getTime() >= scheduledAt.getTime()) return false;
  const secondsUntilLaunch = (launchTime.getTime() - now.getTime()) / 1000;
  return secondsUntilLaunch < getNotificationSecondsBefore(type);
}

/**
 * Build the push schedule for one caller.
 * LAUNCH is always included. Optional warnings come from warningLeads.
 */
export function getNotificationSchedule(
  launchTime: Date,
  warningLeads: AllowedWarningLead[],
  options: {
    /** When the schedule is built. Defaults to now — skips warnings that no longer fit for this caller. */
    referenceTime?: Date;
    /** Send push this many ms before the ideal wall-clock time to offset delivery delay. */
    pushLeadMs?: number;
    /** Include required rally-started alert (scheduled near GO / referenceTime). */
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

  // Required throw alert
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
      return {
        type,
        scheduledAt: new Date(launchMs - secondsBefore * 1000 - pushLeadMs),
      };
    });
}

/** @deprecated Use getNotificationSchedule(launchTime, warningLeads, options) */
export function getNotificationScheduleLegacy(
  launchTime: Date,
  warn10: boolean,
  warn5: boolean,
  launch: boolean,
  options: {
    warn3?: boolean;
    referenceTime?: Date;
    pushLeadMs?: number;
  } = {}
): Array<{ type: NotificationOffsetType; scheduledAt: Date }> {
  const leads: AllowedWarningLead[] = [];
  if (options.warn3) leads.push(3);
  if (warn10) leads.push(10);
  if (warn5) leads.push(5);
  // launch flag ignored — LAUNCH is always required
  void launch;
  return getNotificationSchedule(launchTime, leads, options);
}

export interface NextCallerAssignment {
  id: string;
  displayName: string;
  launchTime: string | null;
  status: string;
}

export interface NextCallerInfo {
  displayName: string;
  displayNames: string[];
  launchTime: string;
  assignmentId: string;
  assignmentIds: string[];
}

/** Pick the current next caller slot: earliest upcoming WAITING, or earliest overdue WAITING. */
export function getNextCaller(
  assignments: NextCallerAssignment[],
  nowMs: number
): NextCallerInfo | null {
  const waiting = assignments
    .filter((a) => a.launchTime && a.status === "WAITING")
    .sort(
      (a, b) =>
        new Date(a.launchTime!).getTime() - new Date(b.launchTime!).getTime()
    );

  if (waiting.length === 0) return null;

  const upcoming = waiting.find((a) => new Date(a.launchTime!).getTime() > nowMs);
  const current = upcoming ?? waiting[0];
  const launchTime = current.launchTime!;
  const slot = waiting.filter((a) => a.launchTime === launchTime);

  return {
    displayName: slot.map((a) => a.displayName).join(", "),
    displayNames: slot.map((a) => a.displayName),
    launchTime,
    assignmentId: current.id,
    assignmentIds: slot.map((a) => a.id),
  };
}

export function getNotificationPayload(
  type: NotificationOffsetType,
  eventName: string,
  callerName: string,
  targetArrival: Date,
  marchSeconds: number,
  gatherSeconds: number
): { title: string; body: string } {
  const march = formatMarchDuration(marchSeconds);
  const gather = formatGatherDuration(gatherSeconds);
  const arrival = targetArrival.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

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
        body: `${eventName}\nTarget: ${arrival}\nMarch: ${march} | Gather: ${gather}`,
      };
  }
}
