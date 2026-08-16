export const DECLARATIVE_WEB_PUSH_VERSION = 8030 as const;

export interface DeclarativeSourcePayload {
  title: string;
  body: string;
  rallyId?: string;
  assignmentId?: string;
  subscriptionId?: string;
  notificationType?: string;
  silent?: boolean;
  dispatchId?: string;
  receiptToken?: string;
}

export interface DeclarativePushEnvelope<T extends DeclarativeSourcePayload> {
  web_push: typeof DECLARATIVE_WEB_PUSH_VERSION;
  mutable: true;
  notification: {
    title: string;
    body: string;
    navigate: string;
    silent: false;
    mutable: true;
    tag: string;
    data: T & { navigate: string };
  };
}

function configuredPushOrigin(): string {
  const candidate =
    process.env.PUSH_APP_ORIGIN ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.NODE_ENV === "production"
      ? ""
      : `http://localhost:${process.env.PORT || "3000"}`);

  try {
    if (!candidate) return "";
    const parsed = new URL(candidate);
    if (
      process.env.NODE_ENV === "production" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    ) {
      return "";
    }
    return parsed.origin;
  } catch {
    // A relative same-origin navigation is safer than directing a user's phone
    // to this server process's localhost address.
    return "";
  }
}

export function pushNavigatePath(payload: DeclarativeSourcePayload): string {
  if (
    payload.assignmentId &&
    payload.rallyId &&
    !String(payload.rallyId).startsWith("calibration")
  ) {
    return `/caller/events/${encodeURIComponent(String(payload.rallyId))}`;
  }
  return "/caller";
}

function trackedNavigateUrl(payload: DeclarativeSourcePayload, origin: string): string {
  const next = pushNavigatePath(payload);
  if (!payload.dispatchId || !payload.receiptToken) {
    return origin ? new URL(next, origin).toString() : next;
  }

  const tracker = new URL("/api/push/open", origin || "https://push-origin.invalid");
  tracker.searchParams.set("dispatchId", payload.dispatchId);
  tracker.searchParams.set("receiptToken", payload.receiptToken);
  tracker.searchParams.set("next", next);
  return origin ? tracker.toString() : `${tracker.pathname}${tracker.search}`;
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
  // A declarative notification can be displayed and opened without launching
  // our service worker. Route the click through a signed same-origin redirect
  // so that fallback delivery becomes visible in the developer timeline.
  const navigate = trackedNavigateUrl(payload, origin);
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
      // Compatibility for WebKit releases affected by webkit.org/b/296770,
      // which read mutable from the notification object instead of its
      // standardized top-level location. Newer WebKit accepts both forms.
      mutable: true,
      tag: pushNotificationTag(payload),
      data,
    },
  };
}
