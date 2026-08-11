"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { CallerRallyView } from "@/components/CallerRallyView";
import { AppShell, AppHeader } from "@/components/ui/AppShell";

export default function CallerEventPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && (user.role === "ADMIN" || user.role === "DEVELOPER")) router.push("/admin");
  }, [user, loading, router]);

  if (loading || !user) {
    return <div className="p-8 text-center text-rally-muted">Loading...</div>;
  }

  return (
    <AppShell className="flex flex-col page-enter">
      <AppHeader
        left={
          <Link href="/caller" className="nav-link text-sm gap-1">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Home
          </Link>
        }
        right={
          <button type="button" onClick={logout} className="btn-ghost text-xs gap-1">
            <LogOut className="h-4 w-4" aria-hidden />
            Logout
          </button>
        }
      />

      <CallerRallyView eventId={eventId} showSettingsLink />
    </AppShell>
  );
}
