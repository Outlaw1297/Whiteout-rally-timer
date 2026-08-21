import Constants from "expo-constants";

/**
 * API base URL for the rally timer backend (no trailing slash).
 * Set EXPO_PUBLIC_API_URL or app.json extra.apiUrl.
 * Examples: https://your-app.onrender.com  |  http://10.0.2.2:3000 (Android emulator)
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const fromExtra = Constants.expoConfig?.extra?.apiUrl;
  if (typeof fromExtra === "string" && fromExtra.trim()) {
    return fromExtra.trim().replace(/\/$/, "");
  }

  // Dev fallback: Expo Go on a physical device needs your LAN IP via EXPO_PUBLIC_API_URL.
  return "http://localhost:3000";
}

export function getWsUrl(): string {
  const base = getApiBaseUrl();
  if (base.startsWith("https://")) return `wss://${base.slice("https://".length)}/ws`;
  if (base.startsWith("http://")) return `ws://${base.slice("http://".length)}/ws`;
  return `ws://${base}/ws`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Only return a real EAS project UUID — never placeholders. */
export function isValidEasProjectId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/**
 * EAS project id required by getExpoPushTokenAsync.
 * Set via `eas init`, app.json extra.eas.projectId, or EXPO_PUBLIC_EAS_PROJECT_ID.
 */
export function getExpoProjectId(): string | undefined {
  const candidates = [
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    Constants.expoConfig?.extra?.eas?.projectId,
    Constants.easConfig?.projectId,
  ];
  for (const raw of candidates) {
    if (isValidEasProjectId(raw)) return raw.trim();
  }
  return undefined;
}
