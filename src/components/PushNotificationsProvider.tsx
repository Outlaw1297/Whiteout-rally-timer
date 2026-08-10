"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

type PushNotificationsApi = ReturnType<typeof usePushNotifications>;

const PushNotificationsContext = createContext<PushNotificationsApi | null>(null);

export function PushNotificationsProvider({ children }: { children: ReactNode }) {
  const api = usePushNotifications();
  return (
    <PushNotificationsContext.Provider value={api}>{children}</PushNotificationsContext.Provider>
  );
}

export function usePushNotificationsContext() {
  const ctx = useContext(PushNotificationsContext);
  if (!ctx) {
    throw new Error("usePushNotificationsContext must be used within PushNotificationsProvider");
  }
  return ctx;
}
