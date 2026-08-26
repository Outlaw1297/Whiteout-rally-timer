import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { type AllowedWarningLead, DEFAULT_WARNING_LEADS } from "@whiteout/shared";
import { apiFetch } from "../lib/api";
import {
  cancelAllLocalNotifications,
  cancelLocalNotificationsForAssignment,
  scheduleLocalNotificationsForAssignment,
} from "../lib/local-notifications";
import { ensureAndroidChannel } from "../lib/push";
import type { SerializedEvent } from "../lib/types";

interface Options {
  event: SerializedEvent | null;
  userId: string | undefined;
  enabled?: boolean;
}

/**
 * When the rally is ACTIVE and this user has a launchTime, schedule OS-local
 * alarms at ideal wall-clock targets. Remote Expo push remains the backup.
 */
export function useLocalNotificationSchedule({ event, userId, enabled = true }: Options) {
  const leadsRef = useRef<AllowedWarningLead[]>([...DEFAULT_WARNING_LEADS]);
  const lastKeyRef = useRef<string>("");

  const loadLeads = useCallback(async () => {
    try {
      const prefs = await apiFetch<{ warningLeadsSeconds: number[] }>("/api/auth/preferences");
      leadsRef.current = (prefs.warningLeadsSeconds || DEFAULT_WARNING_LEADS).filter(
        (n): n is AllowedWarningLead => [60, 30, 15, 10, 5, 3].includes(n)
      ) as AllowedWarningLead[];
    } catch {
      leadsRef.current = [...DEFAULT_WARNING_LEADS];
    }
  }, []);

  const reconcile = useCallback(async () => {
    if (!enabled || !event || !userId) return;

    const assignment = event.assignments.find((a) => a.userId === userId);
    if (!assignment?.launchTime || event.status !== "ACTIVE") {
      if (assignment) await cancelLocalNotificationsForAssignment(assignment.id);
      lastKeyRef.current = "";
      return;
    }

    const key = `${event.id}:${assignment.id}:${assignment.launchTime}:${leadsRef.current.join(",")}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    await ensureAndroidChannel();
    await scheduleLocalNotificationsForAssignment({
      assignmentId: assignment.id,
      eventId: event.id,
      eventName: event.name,
      callerName: assignment.displayName,
      launchTime: new Date(assignment.launchTime),
      targetArrival: event.targetArrivalTime ? new Date(event.targetArrivalTime) : null,
      marchSeconds: assignment.marchDurationSeconds,
      gatherSeconds: event.gatherDurationSeconds,
      warningLeads: leadsRef.current,
      startedAt: null,
      includeRallyStarted: false,
    });
  }, [enabled, event, userId]);

  useEffect(() => {
    void loadLeads().then(() => reconcile());
  }, [loadLeads, reconcile]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        lastKeyRef.current = "";
        void loadLeads().then(() => reconcile());
      }
    });
    return () => sub.remove();
  }, [loadLeads, reconcile]);

  return {
    reschedule: async () => {
      lastKeyRef.current = "";
      await loadLeads();
      await reconcile();
    },
    cancelAll: cancelAllLocalNotifications,
  };
}
