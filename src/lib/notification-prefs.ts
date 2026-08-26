/**
 * Per-user warning leads — shared with mobile via @whiteout/shared.
 */
export {
  ALLOWED_WARNING_LEADS,
  type AllowedWarningLead,
  DEFAULT_WARNING_LEADS,
  type WarningNotificationType,
  type NotificationOffsetType,
  WARNING_TYPE_BY_SECONDS,
  SECONDS_BY_WARNING_TYPE,
  ALL_SCHEDULED_NOTIFICATION_TYPES,
  isAllowedWarningLead,
  normalizeWarningLeads,
  warningLeadsFromLegacyFlags,
  parseUserWarningLeads,
} from "@whiteout/shared";
