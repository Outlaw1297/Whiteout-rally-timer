"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "@/hooks/usePushNotifications";

export function CreateRallyForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const localDateTime = new Date(`${date}T${time}`);
      if (isNaN(localDateTime.getTime())) {
        setError("Invalid date or time");
        return;
      }

      const res = await fetch("/api/rallies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          rallyTime: localDateTime.toISOString(),
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

  useEffect(() => {
    if (!date) {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 5);
      now.setSeconds(0);
      now.setMilliseconds(0);
      setDate(now.toISOString().split("T")[0]);
      setTime(now.toTimeString().slice(0, 5));
    }
  }, [date]);

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

      <div>
        <label className="block text-rally-muted text-sm font-bold mb-2">
          Start Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="w-full py-4 px-4 bg-rally-surface border border-rally-border rounded-lg text-rally-text text-lg focus:outline-none focus:border-rally-accent"
        />
      </div>

      <div>
        <label className="block text-rally-muted text-sm font-bold mb-2">
          Start Time
        </label>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          required
          step="1"
          className="w-full py-4 px-4 bg-rally-surface border border-rally-border rounded-lg text-rally-text text-lg focus:outline-none focus:border-rally-accent"
        />
      </div>

      {error && <p className="text-rally-danger text-sm text-center">{error}</p>}

      <button
        type="submit"
        disabled={loading || !title || !date || !time}
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

  const createTestRally = async (seconds: number) => {
    setLoading(seconds);
    try {
      const res = await fetch("/api/rallies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Test Rally (${seconds}s)`,
          isTestMode: true,
          secondsFromNow: seconds,
          createdBy: getUserId(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/rally/${data.id}?debug=1`);
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full max-w-md">
      <p className="text-rally-muted text-sm text-center font-bold">TESTING MODE</p>
      <div className="grid grid-cols-2 gap-3">
        {[5, 10, 30, 60].map((seconds) => (
          <button
            key={seconds}
            onClick={() => createTestRally(seconds)}
            disabled={loading !== null}
            className="py-3 px-4 bg-rally-surface border border-rally-warning text-rally-warning hover:bg-rally-warning hover:text-black font-bold text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            {loading === seconds ? "..." : `${seconds}s FROM NOW`}
          </button>
        ))}
      </div>
    </div>
  );
}
