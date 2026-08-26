import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  type AllowedWarningLead,
  type NotificationOffsetType,
  getNotificationPayload,
  getNotificationSchedule,
} from "@whiteout/shared";
import { clockSync } from "./clock-sync";
import { markAlertShown, wasAlertShown } from "./shown-alerts";

const CHANNEL_ID = "rally-alerts";

export function localNotificationId(assignmentId: string, type: string): string {
  return `local:${assignmentId}:${type}`;
}

/** Convert a server-aligned target instant into a device Date for OS scheduling. */
export function deviceDateForTarget(targetAtMs: number, correctedNow: () => number = clockSync.correctedNow): Date {
  const delayMs = targetAtMs - correctedNow();
  return new Date(Date.now() + delayMs);
}

export async function cancelLocalNotificationsForAssignment(assignmentId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const prefix = `local:${assignmentId}:`;
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(prefix))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}

export async function cancelAllLocalNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export interface LocalScheduleInput {
  assignmentId: string;
  eventId: string;
  eventName: string;
  callerName: string;
  launchTime: Date;
  targetArrival: Date | null;
  marchSeconds: number;
  gatherSeconds: number;
  warningLeads: AllowedWarningLead[];
  startedAt?: Date | null;
  /** Include RALLY_STARTED when GO just happened and it's still relevant. */
  includeRallyStarted?: boolean;
}

/**
 * Schedule OS-local alarms at ideal wall-clock targets (no push lead).
 * Cancels prior locals for this assignment first.
 */
export async function scheduleLocalNotificationsForAssignment(
  input: LocalScheduleInput
): Promise<{ scheduled: number; skipped: number }> {
  await cancelLocalNotificationsForAssignment(input.assignmentId);

  const now = new Date(clockSync.correctedNow());
  const entries = getNotificationSchedule(input.launchTime, input.warningLeads, {
    referenceTime: now,
    pushLeadMs: 0,
    includeRallyStarted: input.includeRallyStarted ?? false,
    startedAt: input.startedAt,
  });

  let scheduled = 0;
  let skipped = 0;

  for (const entry of entries) {
    const type = entry.type as NotificationOffsetType;
    if (wasAlertShown(input.assignmentId, type)) {
      skipped += 1;
      continue;
    }

    const targetAt = entry.scheduledAt;
    // Skip anything that should already have fired (>2s ago).
    if (targetAt.getTime() < now.getTime() - 2000) {
      skipped += 1;
      continue;
    }

    const fireAt = deviceDateForTarget(targetAt.getTime());
    if (fireAt.getTime() <= Date.now() + 250) {
      // Imminent — still schedule ~300ms out so the OS can deliver.
      fireAt.setTime(Date.now() + 300);
    }

    const payload = getNotificationPayload(
      type,
      input.eventName,
      input.callerName,
      input.targetArrival ?? input.launchTime,
      input.marchSeconds,
      input.gatherSeconds
    );

    const content: Notifications.NotificationContentInput = {
      title: payload.title,
      body: payload.body,
      sound: true,
      data: {
        source: "local",
        rallyId: input.eventId,
        assignmentId: input.assignmentId,
        notificationType: type,
        targetAt: targetAt.toISOString(),
        launchTime: input.launchTime.toISOString(),
      },
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    };

    const trigger: Notifications.NotificationTriggerInput =
      Platform.OS === "android"
        ? {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fireAt,
            channelId: CHANNEL_ID,
          }
        : {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fireAt,
          };

    await Notifications.scheduleNotificationAsync({
      identifier: localNotificationId(input.assignmentId, type),
      content,
      trigger,
    });
    scheduled += 1;
  }

  return { scheduled, skipped };
}

/** When a remote (or local) alert is displayed, cancel the matching local alarm. */
export async function suppressLocalAfterDisplay(
  assignmentId: string | undefined,
  notificationType: string | undefined
): Promise<void> {
  if (!assignmentId || !notificationType) return;
  markAlertShown(assignmentId, notificationType);
  try {
    await Notifications.cancelScheduledNotificationAsync(
      localNotificationId(assignmentId, notificationType)
    );
  } catch {
    // Already cancelled or never scheduled.
  }
}
