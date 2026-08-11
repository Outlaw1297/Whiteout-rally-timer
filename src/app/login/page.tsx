"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AppShell } from "@/components/ui/AppShell";

import { homePathForRole } from "@/lib/roles";
import { shouldOfferDeviceOnboarding } from "@/lib/device-onboarding";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Login failed");
      setLoading(false);
      return;
    }

    const home = homePathForRole(data.user.role);
    if (shouldOfferDeviceOnboarding(data.user.id)) {
      router.push(`/onboarding?next=${encodeURIComponent(home)}`);
      return;
    }
    router.push(home);
  };

  return (
    <AppShell className="flex flex-col items-center justify-center page-enter !max-w-md">
      <header className="mb-8 text-center w-full">
        <div className="flex justify-center mb-4">
          <BrandLogo size="lg" />
        </div>
        <p className="text-rally-muted text-sm">Coordinate multi-caller rallies</p>
        <p className="text-rally-muted text-xs mt-2 max-w-xs mx-auto leading-relaxed">
          Admins run rallies; callers receive their launch times. On phones, install the app
          (iPhone: Safari · Android: Chrome) so throw alerts work.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="w-full flex flex-col gap-4 rounded-xl border border-rally-border bg-rally-surface p-5"
      >
        <Link href="/" className="nav-link gap-1.5 text-xs -mt-1">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to schedule
        </Link>
        <div>
          <label className="label-field" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className="input-field"
            required
          />
        </div>
        <div>
          <label className="label-field" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="input-field"
            required
          />
        </div>

        {error && (
          <p className="text-rally-danger text-sm text-center" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full !text-base">
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>
    </AppShell>
  );
}
