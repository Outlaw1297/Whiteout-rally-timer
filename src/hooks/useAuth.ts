"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { AppRole } from "@/lib/roles";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: AppRole;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setUser(data.user))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/login");
  };

  return { user, loading, logout };
}
