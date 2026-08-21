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

export function getExpoProjectId(): string | undefined {
  const id = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof id === "string" && id && !id.startsWith("REPLACE_")) return id;
  return undefined;
}
