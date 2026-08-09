"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "@/hooks/usePushNotifications";

export function CreateRallyForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/rallies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          createdBy: getUserId(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create rally");
        return;
      }

      router.push(`/rally/${data.id}`);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 w-full max-w-md">
      <div>
        <label className="block text-rally-muted text-sm font-bold mb-2">
          Rally Name
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Bear Trap"
          required
          maxLength={100}
          className="w-full py-4 px-4 bg-rally-surface border border-rally-border rounded-lg text-rally-text text-lg focus:outline-none focus:border-rally-accent"
        />
      </div>

      {error && <p className="text-rally-danger text-sm text-center">{error}</p>}

      <button
        type="submit"
        disabled={loading || !title}
        className="w-full py-5 px-6 bg-rally-accent hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-xl rounded-lg transition-colors"
      >
        {loading ? "CREATING..." : "CREATE RALLY"}
      </button>
    </form>
  );
}

export function TestRallyButtons() {
  const router = useRouter();
  const [loading, setLoading] = useState<number | null>(null);

  const createAndStartTestRally = async (seconds: number) => {
    setLoading(seconds);
    try {
      const createRes = await fetch("/api/rallies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Test Rally (${seconds}s)`,
          isTestMode: true,
          createdBy: getUserId(),
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) return;

      const startRes = await fetch(`/api/rallies/${created.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delaySeconds: seconds,
          controllerId: getUserId(),
        }),
      });

      if (startRes.ok) {
        router.push(`/rally/${created.id}?debug=1`);
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full max-w-md">
      <p className="text-rally-muted text-sm text-center font-bold">TESTING MODE</p>
      <p className="text-rally-muted text-xs text-center">
        Uses the same server scheduler and push path as production rallies.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {[5, 10, 30, 60].map((seconds) => (
          <button
            key={seconds}
            onClick={() => createAndStartTestRally(seconds)}
            disabled={loading !== null}
            className="py-3 px-4 bg-rally-surface border border-rally-warning text-rally-warning hover:bg-rally-warning hover:text-black font-bold text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            {loading === seconds ? "..." : `${seconds}s TEST`}
          </button>
        ))}
      </div>
    </div>
  );
}
