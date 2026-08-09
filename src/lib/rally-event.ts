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
} from "./timing";
import { getServerTime } from "./time";

export type AssignmentWithUser = RallyAssignment & { user: User };
export type EventWithAssignments = RallyEvent & {
  assignments: AssignmentWithUser[];
};

export function recalculateAssignmentTimes(
  targetArrivalTime: Date,
  gatherDurationSeconds: number,
  marchDurationSeconds: number
) {
  const launchTime = calculateLaunchTime(
    targetArrivalTime,
    gatherDurationSeconds,
    marchDurationSeconds
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
  targetArrivalTime: Date
) {
  return {
    id: assignment.id,
    userId: assignment.userId,
    displayName: assignment.user.displayName,
    username: assignment.user.username,
    marchDurationSeconds: assignment.marchDurationSeconds,
    marchFormatted: formatMarch(assignment.marchDurationSeconds),
    launchTime: assignment.launchTime.toISOString(),
    expectedArrivalTime: assignment.expectedArrivalTime.toISOString(),
    status: assignment.status,
    launchedConfirmedAt: assignment.launchedConfirmedAt?.toISOString() ?? null,
    gatherDurationSeconds,
    eventName,
    targetArrivalTime: targetArrivalTime.toISOString(),
  };
}

function formatMarch(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function serializeEvent(event: EventWithAssignments) {
  const assignments = event.assignments
    .map((a) =>
      serializeAssignment(a, event.gatherDurationSeconds, event.name, event.targetArrivalTime)
    )
    .sort((a, b) => a.launchTime.localeCompare(b.launchTime));

  const now = Date.now();
  const nextAssignment = assignments.find(
    (a) => new Date(a.launchTime).getTime() > now && a.status === "WAITING"
  );

  return {
    id: event.id,
    name: event.name,
    targetArrivalTime: event.targetArrivalTime.toISOString(),
    gatherDurationSeconds: event.gatherDurationSeconds,
    status: event.status,
    isTestMode: event.isTestMode,
    startedAt: event.startedAt?.toISOString() ?? null,
    completedAt: event.completedAt?.toISOString() ?? null,
    cancelledAt: event.cancelledAt?.toISOString() ?? null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    assignments,
    nextCaller: nextAssignment
      ? {
          displayName: nextAssignment.displayName,
          launchTime: nextAssignment.launchTime,
          assignmentId: nextAssignment.id,
        }
      : null,
    serverTime: getServerTime(),
  };
}

export function buildNotificationEventsForAssignment(
  assignment: RallyAssignment,
  user: User
) {
  return getNotificationSchedule(
    assignment.launchTime,
    user.warn10Enabled,
    user.warn5Enabled,
    user.launchEnabled
  );
}

export type AssignmentWithNotifications = RallyAssignment & {
  user: User & { pushSubscriptions: PushSubscription[] };
  notificationEvents: NotificationEvent[];
};

export function serializeNotificationMonitor(
  assignment: AssignmentWithNotifications,
  eventName: string
) {
  const devices = assignment.user.pushSubscriptions
    .filter((s) => s.active)
    .map((s) => ({
      platform: s.platform || "unknown",
      active: s.active,
    }));

  return {
    callerName: assignment.user.displayName,
    assignmentId: assignment.id,
    launchTime: assignment.launchTime.toISOString(),
    status: assignment.status,
    launchedConfirmedAt: assignment.launchedConfirmedAt?.toISOString() ?? null,
    hasActiveDevice: devices.length > 0,
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
