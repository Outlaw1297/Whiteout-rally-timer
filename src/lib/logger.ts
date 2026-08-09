type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  [key: string]: unknown;
}

function log(level: LogLevel, event: string, data: Record<string, unknown> = {}) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  const output = JSON.stringify(entry);
  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  info: (event: string, data?: Record<string, unknown>) => log("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => log("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => log("error", event, data),
  debug: (event: string, data?: Record<string, unknown>) => log("debug", event, data),

  rallyCreated: (rallyId: string, title: string, rallyTime: string) =>
    log("info", "rally_created", { rallyId, title, rallyTime }),

  rallyModified: (rallyId: string, changes: Record<string, unknown>) =>
    log("info", "rally_modified", { rallyId, ...changes }),

  rallyCancelled: (rallyId: string) =>
    log("info", "rally_cancelled", { rallyId }),

  notificationScheduled: (
    rallyId: string,
    notificationType: string,
    scheduledAt: string
  ) =>
    log("info", "notification_scheduled", { rallyId, notificationType, scheduledAt }),

  notificationSent: (
    rallyId: string,
    notificationType: string,
    scheduledAt: string,
    sentAt: string,
    latencyMs: number
  ) =>
    log("info", "notification_sent", {
      rallyId,
      notificationType,
      scheduledAt,
      sentAt,
      latencyMs,
      message: `RALLY ${rallyId} EVENT ${notificationType} SCHEDULED ${scheduledAt} SEND ${sentAt} SCHEDULER LATENCY +${latencyMs}ms`,
    }),

  notificationFailed: (
    rallyId: string,
    notificationType: string,
    error: string
  ) =>
    log("error", "notification_failed", { rallyId, notificationType, error }),

  pushSubscriptionCreated: (subscriptionId: string, userId: string) =>
    log("info", "push_subscription_created", { subscriptionId, userId }),

  pushSubscriptionRemoved: (subscriptionId: string, reason?: string) =>
    log("info", "push_subscription_removed", { subscriptionId, reason }),

  websocketConnected: (clientId: string) =>
    log("info", "websocket_connected", { clientId }),

  websocketDisconnected: (clientId: string) =>
    log("info", "websocket_disconnected", { clientId }),
};
