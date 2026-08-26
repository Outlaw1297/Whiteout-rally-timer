import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  fetchMe,
  getStoredToken,
  loginRequest,
  setStoredToken,
  apiFetch,
} from "./api";
import { getOrCreateDeviceId } from "./device-id";
import { cancelAllLocalNotifications } from "./local-notifications";
import { clearAlertShown } from "./shown-alerts";
import type { SessionUser } from "./types";

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = await getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await fetchMe(token);
      setUser(me);
      if (!me) await setStoredToken(null);
    } catch {
      setUser(null);
      await setStoredToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const deviceId = await getOrCreateDeviceId();
    const { user: next, token } = await loginRequest(username, password, deviceId);
    await setStoredToken(token);
    setUser(next);
  }, []);

  const logout = useCallback(async () => {
    try {
      const deviceId = await getOrCreateDeviceId();
      await apiFetch("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ deviceId }),
      });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        // still clear local session
      }
    }
    await setStoredToken(null);
    setUser(null);
    clearAlertShown();
    try {
      await cancelAllLocalNotifications();
    } catch {
      // Native module may be unavailable.
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
