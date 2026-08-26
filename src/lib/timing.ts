import type { NotificationOffsetType } from "./notification-prefs";
import {
  type AllowedWarningLead,
} from "./notification-prefs";
import {
  formatGatherDuration,
  formatMarchDuration,
  getNotificationPayload as sharedGetNotificationPayload,
  getNotificationSchedule as sharedGetNotificationSchedule,
  getNotificationSecondsBefore as sharedGetNotificationSecondsBefore,
  getNotificationTargetAt as sharedGetNotificationTargetAt,
  parseGatherDuration as sharedParseGatherDuration,
  parseMarchDuration as sharedParseMarchDuration,
  shouldSkipNotification as sharedShouldSkipNotification,
} from "@whiteout/shared";

export type { NotificationOffsetType } from "./notification-prefs";
export {
  formatGatherDuration,
  formatMarchDuration,
} from "@whiteout/shared";

/** Default rally (gather) duration: 5 minutes */
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

export type RallyGoSpec = {
  gatherDurationSeconds: number;
  firstCallerLeadSeconds?: number;
  marches: number[];
  offsets?: number[];
};

/**
 * Shared arrival for a batch GO: the latest individual target so every rally
 * can still honor first-caller lead. Stagger is applied by the caller.
 */
export function computeSharedTargetArrivalOnGo(
  startedAt: Date,
  rallies: RallyGoSpec[]
): Date {
  if (rallies.length === 0) return startedAt;
  let latest = startedAt;
  for (const rally of rallies) {
    const target = computeTargetArrivalOnGo(
      startedAt,
      rally.gatherDurationSeconds,
      rally.marches,
      rally.firstCallerLeadSeconds,
      rally.offsets ?? []
    );
    if (target.getTime() > latest.getTime()) latest = target;
  }
  return latest;
}

/** Parse "8:00", "6:30", "4:15", "12:37" → seconds */
export function parseMarchDuration(input: string): number | null {
  return sharedParseMarchDuration(input);
}

export function parseGatherDuration(input: string): number | null {
  return sharedParseGatherDuration(input);
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
  return sharedGetNotificationSecondsBefore(type);
}

/** Wall-clock moment the caller should experience this notification. */
export function getNotificationTargetAt(
  launchTime: Date,
  type: NotificationOffsetType,
  options: { startedAt?: Date | null } = {}
): Date {
  return sharedGetNotificationTargetAt(launchTime, type, options);
}

/** Skip a warning if less than its lead time remains before launch (applies to every caller). */
export function shouldSkipNotification(
  type: NotificationOffsetType,
  launchTime: Date,
  now: Date = new Date(),
  scheduledAt?: Date
): boolean {
  return sharedShouldSkipNotification(type, launchTime, now, scheduledAt);
}

/**
 * When Android delivers a warning late, rewrite so we never show "10 seconds"
 * after that moment has already passed. Escalate to LAUNCH when throw is imminent.
 */
export function resolveLateNotificationPresentation(
  type: NotificationOffsetType,
  launchTime: Date | null | undefined,
  nowMs: number,
  base: { title: string; body: string }
): { type: NotificationOffsetType; title: string; body: string; escalated: boolean } {
  if (!launchTime || type === "RALLY_STARTED" || type === "LAUNCH") {
    return { type, title: base.title, body: base.body, escalated: false };
  }
  if (!String(type).startsWith("WARNING_")) {
    return { type, title: base.title, body: base.body, escalated: false };
  }

  const secondsLeft = (launchTime.getTime() - nowMs) / 1000;
  if (secondsLeft <= 3) {
    return {
      type: "LAUNCH",
      title: "🚨 THROW RALLY NOW",
      body: base.body.includes("Target:")
        ? base.body
        : `${base.body}\nThrow window is now.`,
      escalated: true,
    };
  }

  const idealBefore = getNotificationSecondsBefore(type);
  // More than ~1.5s late vs the labeled warning → show real remaining time.
  if (secondsLeft < idealBefore - 1.5) {
    const secs = Math.max(1, Math.ceil(secondsLeft));
    return {
      type,
      title: `${secs}s — throw soon`,
      body: base.body,
      escalated: true,
    };
  }

  return { type, title: base.title, body: base.body, escalated: false };
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
  return sharedGetNotificationSchedule(launchTime, warningLeads, options);
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
  return sharedGetNotificationPayload(
    type,
    eventName,
    callerName,
    targetArrival,
    marchSeconds,
    gatherSeconds
  );
}
