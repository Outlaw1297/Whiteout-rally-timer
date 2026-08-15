import { shortDeviceId } from "./device-id";

export const ACTIVITY_KINDS = [
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "DEVICE_REGISTER",
  "DEVICE_RETIRE",
  "DEVICE_UNBIND",
  "SW_HEALTH",
  "PUSH_TEST",
  "PUSH_SENT",
  "PUSH_FAILED",
  "PUSH_SKIPPED",
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type ActivityGroup = "auth" | "device" | "notification";

const KINDS_BY_GROUP: Record<ActivityGroup, readonly ActivityKind[]> = {
  auth: ["LOGIN", "LOGIN_FAILED", "LOGOUT"],
  device: ["DEVICE_REGISTER", "DEVICE_RETIRE", "DEVICE_UNBIND", "SW_HEALTH"],
  notification: ["PUSH_TEST", "PUSH_SENT", "PUSH_FAILED", "PUSH_SKIPPED"],
};

export interface ActivityLogInput {
  kind: ActivityKind;
  success?: boolean;
  userId?: string | null;
  username?: string | null;
  displayName?: string | null;
  deviceId?: string | null;
  subscriptionId?: string | null;
  platform?: string | null;
  message?: string | null;
  error?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface PushTestDeviceResult {
  subscriptionId: string;
  deviceId?: string | null;
  deviceLabel?: string | null;
  platform: string | null;
  user: string;
  username?: string | null;
  success: boolean;
  error?: string;
  statusCode?: number;
  deactivated?: boolean;
  latencyMs?: number;
  endpointHost?: string;
}

export function isActivityKind(value: unknown): value is ActivityKind {
  return typeof value === "string" && (ACTIVITY_KINDS as readonly string[]).includes(value);
}

export function isActivityGroup(value: unknown): value is ActivityGroup {
  return value === "auth" || value === "device" || value === "notification";
}

export function kindsForGroup(group: ActivityGroup): ActivityKind[] {
  return [...KINDS_BY_GROUP[group]];
}

export function activityKindGroup(kind: string): ActivityGroup | "other" {
  if ((KINDS_BY_GROUP.auth as readonly string[]).includes(kind)) return "auth";
  if ((KINDS_BY_GROUP.device as readonly string[]).includes(kind)) return "device";
  if ((KINDS_BY_GROUP.notification as readonly string[]).includes(kind)) return "notification";
  return "other";
}

export function activityKindLabel(kind: string): string {
  switch (kind) {
    case "LOGIN":
      return "Login";
    case "LOGIN_FAILED":
      return "Login failed";
    case "LOGOUT":
      return "Logout";
    case "DEVICE_REGISTER":
      return "Device registered";
    case "DEVICE_RETIRE":
      return "Device retired";
    case "DEVICE_UNBIND":
      return "Device unbound";
    case "SW_HEALTH":
      return "Worker health";
    case "PUSH_TEST":
      return "Test push";
    case "PUSH_SENT":
      return "Push sent";
    case "PUSH_FAILED":
      return "Push failed";
    case "PUSH_SKIPPED":
      return "Push missed";
    default:
      return kind;
  }
}

export function pushEndpointHost(endpoint: string | null | undefined): string | null {
  if (!endpoint) return null;
  try {
    return new URL(endpoint).host;
  } catch {
    return null;
  }
}

export function summarizePushTestResults(results: PushTestDeviceResult[]): {
  devicesTested: number;
  devicesNotified: number;
  headline: string;
  detail: string;
} {
  const devicesTested = results.length;
  const devicesNotified = results.filter((r) => r.success).length;
  const failed = devicesTested - devicesNotified;
  const deactivated = results.filter((r) => r.deactivated).length;
  const headline =
    devicesTested === 0
      ? "No devices to test"
      : `Push service accepted ${devicesNotified}/${devicesTested} device${
          devicesTested === 1 ? "" : "s"
        }`;
  const parts: string[] = [];
  if (failed > 0) parts.push(`${failed} failed`);
  if (deactivated > 0) parts.push(`${deactivated} stale endpoint${deactivated === 1 ? "" : "s"} deactivated`);
  if (failed === 0 && devicesNotified > 0) {
    parts.push(
      "Accepted means Apple/FCM took the message — the phone can still stay silent if Show Previews is off"
    );
  }
  return {
    devicesTested,
    devicesNotified,
    headline,
    detail: parts.join(" · "),
  };
}

export function formatPushTestRow(result: PushTestDeviceResult): string {
  const bits = [
    result.user,
    result.platform || "unknown",
    result.deviceLabel || (result.deviceId ? shortDeviceId(result.deviceId) : null),
    result.endpointHost,
    result.success ? (result.statusCode ? `HTTP ${result.statusCode}` : "accepted") : null,
    result.latencyMs != null ? `${result.latencyMs}ms` : null,
  ].filter(Boolean);
  const suffix = result.success
    ? ""
    : result.error
      ? ` — ${result.error}`
      : " — failed";
  const deactivated = result.deactivated ? " (endpoint deactivated)" : "";
  return `${bits.join(" · ")}${suffix}${deactivated}`;
}

export function pushResultToActivity(opts: {
  success: boolean;
  skipped?: boolean;
  userId?: string | null;
  username?: string | null;
  displayName?: string | null;
  deviceId?: string | null;
  subscriptionId?: string | null;
  platform?: string | null;
  message?: string | null;
  error?: string | null;
  meta?: Record<string, unknown> | null;
}): ActivityLogInput {
  const kind: ActivityKind = opts.skipped
    ? "PUSH_SKIPPED"
    : opts.success
      ? "PUSH_SENT"
      : "PUSH_FAILED";
  return {
    kind,
    success: !!opts.success && !opts.skipped,
    userId: opts.userId,
    username: opts.username,
    displayName: opts.displayName,
    deviceId: opts.deviceId,
    subscriptionId: opts.subscriptionId,
    platform: opts.platform,
    message: opts.message,
    error: opts.error,
    meta: opts.meta,
  };
}
