/** Default gather duration: 5 minutes */
export const DEFAULT_GATHER_SECONDS = 300;

/** Lead time before first caller launches so a 3-second warning can fire after GO */
export const FIRST_CALLER_WARNING_SECONDS = 3;

/**
 * launchTime = targetArrivalTime - gatherDurationSeconds - marchDurationSeconds
 */
export function calculateLaunchTime(
  targetArrivalTime: Date,
  gatherDurationSeconds: number,
  marchDurationSeconds: number
): Date {
  const offsetMs = (gatherDurationSeconds + marchDurationSeconds) * 1000;
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

/**
 * When GO is pressed: target arrival = now + gather + longest march.
 * Longest-march caller launches immediately; others launch later so all arrive together.
 */
export function computeTargetArrivalOnGo(
  startedAt: Date,
  gatherDurationSeconds: number,
  marchDurationsSeconds: number[]
): Date {
  const maxMarch = Math.max(...marchDurationsSeconds);
  return new Date(
    startedAt.getTime() +
      (gatherDurationSeconds + maxMarch + FIRST_CALLER_WARNING_SECONDS) * 1000
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
  { type: "WARNING_10" as const, secondsBefore: 10 },
  { type: "WARNING_5" as const, secondsBefore: 5 },
  { type: "WARNING_3" as const, secondsBefore: 3 },
  { type: "LAUNCH" as const, secondsBefore: 0 },
];

export type NotificationOffsetType = (typeof NOTIFICATION_OFFSETS)[number]["type"];

export function getNotificationSchedule(
  launchTime: Date,
  warn10: boolean,
  warn5: boolean,
  launch: boolean,
  warn3 = false
): Array<{ type: NotificationOffsetType; scheduledAt: Date }> {
  const events: Array<{ type: NotificationOffsetType; scheduledAt: Date }> = [];
  const launchMs = launchTime.getTime();

  if (warn3) {
    events.push({
      type: "WARNING_3",
      scheduledAt: new Date(launchMs - 3_000),
    });
  }
  if (warn10) {
    events.push({
      type: "WARNING_10",
      scheduledAt: new Date(launchMs - 10_000),
    });
  }
  if (warn5) {
    events.push({
      type: "WARNING_5",
      scheduledAt: new Date(launchMs - 5_000),
    });
  }
  if (launch) {
    events.push({ type: "LAUNCH", scheduledAt: new Date(launchMs) });
  }

  return events;
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
    case "WARNING_10":
      return {
        title: `⚠️ ${eventName}`,
        body: `Rally in 10 seconds — ${callerName}`,
      };
    case "WARNING_5":
      return {
        title: `⚠️ ${eventName}`,
        body: `Rally in 5 seconds — ${callerName}`,
      };
    case "WARNING_3":
      return {
        title: `⚠️ ${eventName}`,
        body: `Rally in 3 seconds — ${callerName}`,
      };
    case "LAUNCH":
      return {
        title: `🚨 THROW RALLY NOW`,
        body: `${eventName}\nTarget: ${arrival}\nMarch: ${march} | Gather: ${gather}`,
      };
  }
}
