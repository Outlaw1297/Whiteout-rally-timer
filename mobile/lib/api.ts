import * as SecureStore from "expo-secure-store";
import { getApiBaseUrl } from "./config";
import type { SessionUser } from "./types";

const TOKEN_KEY = "rally_session_token";

export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredToken(token: string | null): Promise<void> {
  if (!token) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, headers, ...rest } = options;
  const authToken = token === undefined ? await getStoredToken() : token;
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(headers || {}),
    },
  });

  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string }).error || `Request failed (${res.status})`,
      res.status
    );
  }
  return data;
}

export async function loginRequest(
  username: string,
  password: string,
  deviceId?: string | null
): Promise<{ user: SessionUser; token: string }> {
  const data = await apiFetch<{ user: SessionUser; token?: string }>("/api/auth/login", {
    method: "POST",
    token: null,
    body: JSON.stringify({ username, password, deviceId: deviceId || undefined }),
  });
  if (!data.token) {
    throw new ApiError("Server did not return a session token — update the backend", 500);
  }
  return { user: data.user, token: data.token };
}

export async function fetchMe(token?: string | null): Promise<SessionUser | null> {
  const data = await apiFetch<{ user: SessionUser | null; token?: string }>(
    "/api/auth/me",
    { token }
  );
  if (data.token) {
    await setStoredToken(data.token);
  }
  return data.user;
}
