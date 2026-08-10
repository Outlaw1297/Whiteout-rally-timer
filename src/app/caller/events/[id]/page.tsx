"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { CallerRallyView } from "@/components/CallerRallyView";
import { HomeButton } from "@/components/HomeButton";

export default function CallerEventPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && user.role === "ADMIN") router.push("/admin");
  }, [user, loading, router]);

  if (loading || !user) {
    return <div className="p-8 text-center text-rally-muted">Loading...</div>;
  }

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <Link href="/caller" className="text-rally-muted text-sm hover:text-rally-accent">
          ← Home
        </Link>
        <div className="flex items-center gap-3">
          <HomeButton />
          <button onClick={logout} className="text-rally-muted text-sm hover:text-rally-danger">
            Logout
          </button>
        </div>
      </div>

      <CallerRallyView eventId={eventId} showSettingsLink />
    </main>
  );
}
