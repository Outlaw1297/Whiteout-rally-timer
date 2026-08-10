/**
 * Per-user optional warning leads (seconds before throw).
 * Rally Timer Started + Throw Rally Now are always required and not listed here.
 */
export const ALLOWED_WARNING_LEADS = [60, 30, 15, 10, 5, 3] as const;
export type AllowedWarningLead = (typeof ALLOWED_WARNING_LEADS)[number];

export const DEFAULT_WARNING_LEADS: AllowedWarningLead[] = [10, 5];

export type WarningNotificationType =
  | "WARNING_60"
  | "WARNING_30"
  | "WARNING_15"
  | "WARNING_10"
  | "WARNING_5"
  | "WARNING_3";

export type NotificationOffsetType =
  | "RALLY_STARTED"
  | WarningNotificationType
  | "LAUNCH";

export const WARNING_TYPE_BY_SECONDS: Record<AllowedWarningLead, WarningNotificationType> = {
  60: "WARNING_60",
  30: "WARNING_30",
  15: "WARNING_15",
  10: "WARNING_10",
  5: "WARNING_5",
  3: "WARNING_3",
};

export const SECONDS_BY_WARNING_TYPE: Record<WarningNotificationType, AllowedWarningLead> = {
  WARNING_60: 60,
  WARNING_30: 30,
  WARNING_15: 15,
  WARNING_10: 10,
  WARNING_5: 5,
  WARNING_3: 3,
};

export const ALL_SCHEDULED_NOTIFICATION_TYPES: NotificationOffsetType[] = [
  "RALLY_STARTED",
  "WARNING_60",
  "WARNING_30",
  "WARNING_15",
  "WARNING_10",
  "WARNING_5",
  "WARNING_3",
  "LAUNCH",
];

export function isAllowedWarningLead(value: number): value is AllowedWarningLead {
  return (ALLOWED_WARNING_LEADS as readonly number[]).includes(value);
}

/** Normalize stored JSON / legacy prefs into a sorted unique list of allowed leads. */
export function normalizeWarningLeads(raw: unknown): AllowedWarningLead[] {
  if (Array.isArray(raw)) {
    const leads = raw
      .map((v) => (typeof v === "number" ? v : Number(v)))
      .filter((v) => Number.isFinite(v) && isAllowedWarningLead(v)) as AllowedWarningLead[];
    return Array.from(new Set(leads)).sort((a, b) => b - a);
  }
  return [...DEFAULT_WARNING_LEADS];
}

/** Build leads from deprecated boolean columns when JSON is empty/missing. */
export function warningLeadsFromLegacyFlags(warn10: boolean, warn5: boolean): AllowedWarningLead[] {
  const leads: AllowedWarningLead[] = [];
  if (warn10) leads.push(10);
  if (warn5) leads.push(5);
  return leads;
}

export function parseUserWarningLeads(user: {
  warningLeadsSeconds?: unknown;
  warn10Enabled?: boolean;
  warn5Enabled?: boolean;
}): AllowedWarningLead[] {
  if (user.warningLeadsSeconds != null) {
    const fromJson = normalizeWarningLeads(user.warningLeadsSeconds);
    // Empty array is a valid choice (warnings off; required alerts still fire).
    if (Array.isArray(user.warningLeadsSeconds)) return fromJson;
  }
  if (user.warn10Enabled !== undefined || user.warn5Enabled !== undefined) {
    return warningLeadsFromLegacyFlags(!!user.warn10Enabled, !!user.warn5Enabled);
  }
  return [...DEFAULT_WARNING_LEADS];
}
