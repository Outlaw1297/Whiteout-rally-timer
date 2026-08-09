"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

    router.push(data.user.role === "ADMIN" ? "/admin" : "/caller");
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-rally-accent mb-1">
          ⚔️ WHITEOUT RALLY TIMER
        </h1>
        <p className="text-rally-muted text-sm">Coordinate multi-caller rallies</p>
        <p className="text-rally-muted text-xs mt-2 max-w-xs mx-auto">
          Admins run rallies; callers receive their launch times. An admin can be a caller too.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-4">
        <Link href="/" className="text-rally-muted text-sm hover:text-rally-accent -mb-2">
          ← Back to schedule
        </Link>
        <div>
          <label className="block text-rally-muted text-xs mb-1">USERNAME</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className="w-full px-4 py-3 bg-rally-surface border border-rally-border rounded-lg text-rally-text"
            required
          />
        </div>
        <div>
          <label className="block text-rally-muted text-xs mb-1">PASSWORD</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full px-4 py-3 bg-rally-surface border border-rally-border rounded-lg text-rally-text"
            required
          />
        </div>

        {error && <p className="text-rally-danger text-sm text-center">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-rally-accent hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-lg rounded-lg"
        >
          {loading ? "LOGGING IN..." : "LOG IN"}
        </button>
      </form>
    </main>
  );
}
