export const DECLARATIVE_WEB_PUSH_VERSION = 8030 as const;

export interface DeclarativeSourcePayload {
  title: string;
  body: string;
  rallyId?: string;
  assignmentId?: string;
  subscriptionId?: string;
  notificationType?: string;
  silent?: boolean;
}

export interface DeclarativePushEnvelope<T extends DeclarativeSourcePayload> {
  web_push: typeof DECLARATIVE_WEB_PUSH_VERSION;
  mutable: true;
  notification: {
    title: string;
    body: string;
    navigate: string;
    silent: false;
    tag: string;
    data: T & { navigate: string };
  };
}

function configuredPushOrigin(): string {
  const candidate =
    process.env.PUSH_APP_ORIGIN ||
    process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${process.env.PORT || "3000"}`;

  try {
    return new URL(candidate).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export function pushNavigatePath(payload: DeclarativeSourcePayload): string {
  if (payload.rallyId && !String(payload.rallyId).startsWith("calibration")) {
    return `/caller/events/${encodeURIComponent(String(payload.rallyId))}`;
  }
  return "/caller";
}

export function pushNotificationTag(payload: DeclarativeSourcePayload): string {
  const subscriptionId = String(payload.subscriptionId || "device");
  if (payload.notificationType === "CALIBRATION") {
    return `rally-calibration-${subscriptionId}`;
  }
  if (payload.assignmentId) return `rally-caller-${String(payload.assignmentId)}`;
  return `rally-event-${String(payload.rallyId || "general")}`;
}

/**
 * Build the standard Declarative Web Push JSON shape. The application payload
 * lives in NotificationOptions.data, so legacy browsers can unwrap and display
 * the same message in the service worker while newer WebKit can display a
 * fallback without relying on worker JavaScript.
 */
export function buildDeclarativePushEnvelope<T extends DeclarativeSourcePayload>(
  payload: T,
  origin = configuredPushOrigin()
): DeclarativePushEnvelope<T> {
  const title = payload.title.trim() || "Whiteout Rally";
  const body = payload.body.trim() || "Rally notification";
  const navigate = new URL(pushNavigatePath(payload), origin).toString();
  const data = { ...payload, title, body, silent: false, navigate } as T & {
    navigate: string;
  };

  return {
    web_push: DECLARATIVE_WEB_PUSH_VERSION,
    // Apple displays the declarative notification directly unless this flag
    // opts into service-worker processing. The declared notification remains
    // the visible fallback if worker startup or replacement display fails.
    mutable: true,
    notification: {
      title,
      body,
      navigate,
      silent: false,
      tag: pushNotificationTag(payload),
      data,
    },
  };
}
