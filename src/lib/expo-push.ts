/**
 * Expo Push helpers — native iOS/Android apps register Expo push tokens.
 * Stored as PushSubscription rows with endpoint `expo:<token>`.
 */

export const EXPO_PUSH_ENDPOINT_PREFIX = "expo:";
export const EXPO_PUSH_KEY_PLACEHOLDER = "expo";

const EXPO_TOKEN_RE =
  /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$|^[a-zA-Z0-9_-]{16,}$/;

export function isExpoPushEndpoint(endpoint: string | null | undefined): boolean {
  return !!endpoint && endpoint.startsWith(EXPO_PUSH_ENDPOINT_PREFIX);
}

export function expoEndpointFromToken(token: string): string {
  return `${EXPO_PUSH_ENDPOINT_PREFIX}${token.trim()}`;
}

export function expoTokenFromEndpoint(endpoint: string): string | null {
  if (!isExpoPushEndpoint(endpoint)) return null;
  const token = endpoint.slice(EXPO_PUSH_ENDPOINT_PREFIX.length).trim();
  return token || null;
}

export function isValidExpoPushToken(token: unknown): token is string {
  return typeof token === "string" && EXPO_TOKEN_RE.test(token.trim());
}

export interface ExpoPushSendResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  providerMessageId?: string;
}

export async function sendExpoPushNotification(
  expoPushToken: string,
  payload: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
    silent?: boolean;
    ttlSeconds?: number;
  }
): Promise<ExpoPushSendResult> {
  const ttl = payload.ttlSeconds ?? 900;
  const message: Record<string, unknown> = {
    to: expoPushToken,
    sound: payload.silent ? null : "default",
    priority: "high",
    ttl,
    expiration: Math.floor(Date.now() / 1000) + ttl,
    data: payload.data || {},
  };

  if (!payload.silent) {
    message.title = payload.title;
    message.body = payload.body;
    message.channelId = "rally-alerts";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
      signal: controller.signal,
    });

    const statusCode = response.status;
    const json = (await response.json().catch(() => null)) as {
      data?: { status?: string; id?: string; message?: string; details?: { error?: string } };
      errors?: Array<{ message?: string }>;
    } | null;

    if (!response.ok) {
      return {
        success: false,
        statusCode,
        error:
          json?.errors?.[0]?.message ||
          `Expo push HTTP ${statusCode}`,
      };
    }

    const ticket = json?.data;
    if (ticket?.status === "error") {
      const errCode = ticket.details?.error;
      return {
        success: false,
        statusCode: errCode === "DeviceNotRegistered" ? 410 : statusCode,
        error: ticket.message || errCode || "Expo push ticket error",
        providerMessageId: ticket.id,
      };
    }

    return {
      success: true,
      statusCode,
      providerMessageId: ticket?.id,
    };
  } catch (err) {
    const messageText =
      err instanceof Error
        ? err.name === "AbortError"
          ? "expo push send timed out"
          : err.message
        : "Unknown Expo push error";
    return { success: false, error: messageText };
  } finally {
    clearTimeout(timeout);
  }
}
