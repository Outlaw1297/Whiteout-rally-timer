import type {
  RallyEvent,
  RallyAssignment,
  User,
  NotificationEvent,
  PushSubscription,
} from "@prisma/client";
import {
  calculateLaunchTime,
  calculateExpectedArrival,
  getNotificationSchedule,
  getNextCaller,
} from "./timing";
import { getServerTime } from "./time";

export type AssignmentWithUser = RallyAssignment & { user: User | null };
export type EventWithAssignments = RallyEvent & {
  assignments: AssignmentWithUser[];
};

export function recalculateAssignmentTimes(
  targetArrivalTime: Date,
  gatherDurationSeconds: number,
  marchDurationSeconds: number,
  arrivalOffsetSeconds = 0
) {
  const launchTime = calculateLaunchTime(
    targetArrivalTime,
    gatherDurationSeconds,
    marchDurationSeconds,
    arrivalOffsetSeconds
  );
  const expectedArrivalTime = calculateExpectedArrival(
    launchTime,
    gatherDurationSeconds,
    marchDurationSeconds
  );
  return { launchTime, expectedArrivalTime };
}

export function serializeAssignment(
  assignment: AssignmentWithUser,
  gatherDurationSeconds: number,
  eventName: string,
  targetArrivalTime: Date | null
) {
  return {
    id: assignment.id,
    userId: assignment.userId,
    displayName: assignment.callerName,
    username: assignment.user?.username ?? null,
    marchDurationSeconds: assignment.marchDurationSeconds,
    marchFormatted: formatMarch(assignment.marchDurationSeconds),
    arrivalOffsetSeconds: assignment.arrivalOffsetSeconds ?? 0,
    launchTime: assignment.launchTime?.toISOString() ?? null,
    expectedArrivalTime: assignment.expectedArrivalTime?.toISOString() ?? null,
    status: assignment.status,
    launchedConfirmedAt: assignment.launchedConfirmedAt?.toISOString() ?? null,
    gatherDurationSeconds,
    eventName,
    targetArrivalTime: targetArrivalTime?.toISOString() ?? null,
    hasPushAccount: !!assignment.userId,
  };
}

function formatMarch(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function sortAssignments<
  T extends {
    launchTime: string | null;
    marchDurationSeconds: number;
    arrivalOffsetSeconds?: number;
  }
>(assignments: T[]): T[] {
  return [...assignments].sort((a, b) => {
    if (a.launchTime && b.launchTime) return a.launchTime.localeCompare(b.launchTime);
    if (a.launchTime) return -1;
    if (b.launchTime) return 1;
    const offsetDiff = (a.arrivalOffsetSeconds ?? 0) - (b.arrivalOffsetSeconds ?? 0);
    if (offsetDiff !== 0) return offsetDiff;
    return b.marchDurationSeconds - a.marchDurationSeconds;
  });
}

export function serializeEvent(event: EventWithAssignments) {
  const assignments = sortAssignments(
    event.assignments.map((a) =>
      serializeAssignment(a, event.gatherDurationSeconds, event.name, event.targetArrivalTime)
    )
  );

  const now = Date.now();
  const nextCaller = getNextCaller(assignments, now);

  return {
    id: event.id,
    name: event.name,
    targetArrivalTime: event.targetArrivalTime?.toISOString() ?? null,
    gatherDurationSeconds: event.gatherDurationSeconds,
    firstCallerLeadSeconds: event.firstCallerLeadSeconds,
    pushLeadMs: event.pushLeadMs,
    status: event.status,
    isTestMode: event.isTestMode,
    pinned: event.pinned ?? false,
    sortOrder: event.sortOrder ?? 0,
    isTemplate: !event.targetArrivalTime && event.status !== "ACTIVE",
    startedAt: event.startedAt?.toISOString() ?? null,
    completedAt: event.completedAt?.toISOString() ?? null,
    cancelledAt: event.cancelledAt?.toISOString() ?? null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    assignments,
    nextCaller,
    serverTime: getServerTime(),
  };
}

export function buildNotificationEventsForAssignment(
  assignment: RallyAssignment,
  user: User,
  options: {
    referenceTime?: Date;
    pushLeadMs?: number;
  } = {}
) {
  if (!assignment.launchTime) return [];
  return getNotificationSchedule(
    assignment.launchTime,
    user.warn10Enabled,
    user.warn5Enabled,
    user.launchEnabled,
    {
      warn3: true,
      referenceTime: options.referenceTime ?? new Date(),
      pushLeadMs: options.pushLeadMs,
    }
  );
}

export type AssignmentWithNotifications = RallyAssignment & {
  user: (User & { pushSubscriptions: PushSubscription[] }) | null;
  notificationEvents: NotificationEvent[];
};

export function serializeNotificationMonitor(
  assignment: AssignmentWithNotifications,
  eventName: string
) {
  const devices = (assignment.user?.pushSubscriptions ?? [])
    .filter((s) => s.active)
    .map((s) => ({
      platform: s.platform || "unknown",
      active: s.active,
    }));

  return {
    callerName: assignment.callerName,
    assignmentId: assignment.id,
    launchTime: assignment.launchTime?.toISOString() ?? null,
    status: assignment.status,
    launchedConfirmedAt: assignment.launchedConfirmedAt?.toISOString() ?? null,
    hasActiveDevice: devices.length > 0,
    hasPushAccount: !!assignment.userId,
    devices,
    notifications: assignment.notificationEvents.map((n) => ({
      type: n.type,
      scheduledAt: n.scheduledAt.toISOString(),
      sentAt: n.sentAt?.toISOString() ?? null,
      status: n.status,
      latencyMs: n.latencyMs,
      error: n.error,
    })),
    eventName,
  };
}
