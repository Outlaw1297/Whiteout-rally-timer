"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { formatArrivalTime } from "@/lib/display";
import type { SerializedEvent } from "@/hooks/useEventSocket";

export default function AdminDashboard() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<SerializedEvent[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && user.role !== "ADMIN") router.push("/caller");
  }, [user, loading, router]);

  const loadEvents = () => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((data) => setEvents(data.events || []));
  };

  useEffect(() => {
    if (user?.role === "ADMIN") loadEvents();
  }, [user]);

  if (loading || !user) {
    return <div className="p-8 text-center text-rally-muted">Loading...</div>;
  }

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-rally-accent">ADMIN</h1>
          <p className="text-rally-muted text-sm">{user.displayName}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/users" className="text-rally-muted text-sm hover:text-rally-accent">
            Users
          </Link>
          <button onClick={logout} className="text-rally-muted text-sm hover:text-rally-danger">
            Logout
          </button>
        </div>
      </header>

      <button
        onClick={() => setShowCreate(!showCreate)}
        className="w-full py-4 mb-4 bg-rally-accent text-white font-bold rounded-lg"
      >
        {showCreate ? "CANCEL" : "+ CREATE RALLY"}
      </button>

      {showCreate && (
        <CreateEventForm
          onCreated={() => {
            setShowCreate(false);
            loadEvents();
          }}
        />
      )}

      <section className="flex flex-col gap-4">
        {events.length === 0 && (
          <p className="text-rally-muted text-center py-8">No rallies yet</p>
        )}
        {events.map((event) => (
          <Link
            key={event.id}
            href={`/admin/events/${event.id}`}
            className="block p-4 bg-rally-surface border border-rally-border rounded-lg hover:border-rally-accent"
          >
            <div className="flex justify-between items-start">
              <h2 className="font-bold text-lg">{event.name}</h2>
              <span className="text-xs text-rally-muted">{event.status}</span>
            </div>
            <p className="text-rally-muted text-sm mt-1">
              Arrival: {formatArrivalTime(event.targetArrivalTime)}
            </p>
            <p className="text-rally-muted text-sm">
              {event.assignments.length} caller{event.assignments.length !== 1 ? "s" : ""}
            </p>
          </Link>
        ))}
      </section>
    </main>
  );
}

function CreateEventForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [gather, setGather] = useState("5:00");
  const [isTest, setIsTest] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const parseGather = (input: string): number | null => {
    const match = input.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  };

  const handleTestMode = () => {
    setIsTest(true);
    setName("TEST RALLY");
    const target = new Date(Date.now() + 60_000);
    setDate(target.toISOString().slice(0, 10));
    setTime(target.toTimeString().slice(0, 5));
    setGather("0:10");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const gatherSeconds = parseGather(gather);
    if (!gatherSeconds) {
      setError("Invalid gather duration (use M:SS)");
      setLoading(false);
      return;
    }

    const targetArrivalTime = new Date(`${date}T${time}:00`).toISOString();

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        targetArrivalTime,
        gatherDurationSeconds: gatherSeconds,
        isTestMode: isTest,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to create");
      setLoading(false);
      return;
    }

    onCreated();
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg flex flex-col gap-3">
      <button
        type="button"
        onClick={handleTestMode}
        className="text-rally-warning text-sm font-bold text-left"
      >
        ⚡ Quick Test Mode (60s target, 10s gather)
      </button>

      <input
        placeholder="Rally Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="px-3 py-2 bg-rally-bg border border-rally-border rounded text-rally-text"
        required
      />
      <div className="flex gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 px-3 py-2 bg-rally-bg border border-rally-border rounded text-rally-text"
          required
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="flex-1 px-3 py-2 bg-rally-bg border border-rally-border rounded text-rally-text"
          required
        />
      </div>
      <div>
        <label className="text-rally-muted text-xs">GATHER DURATION (M:SS)</label>
        <input
          value={gather}
          onChange={(e) => setGather(e.target.value)}
          className="w-full px-3 py-2 bg-rally-bg border border-rally-border rounded text-rally-text"
        />
      </div>

      {error && <p className="text-rally-danger text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="py-3 bg-rally-success text-white font-bold rounded-lg disabled:opacity-50"
      >
        {loading ? "CREATING..." : "CREATE RALLY"}
      </button>
    </form>
  );
}
