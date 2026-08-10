"use client";

import { useEffect, useState } from "react";

/** Per-user notification timing prefs. Rally Started + Throw Now are always required. */
export function NotificationPreferences() {
  const [leads, setLeads] = useState<number[]>([10, 5]);
  const [allowed, setAllowed] = useState<number[]>([60, 30, 15, 10, 5, 3]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.warningLeadsSeconds)) setLeads(data.warningLeadsSeconds);
        if (Array.isArray(data.allowedWarningLeads)) setAllowed(data.allowedWarningLeads);
      })
      .catch(() => {});
  }, []);

  const toggleLead = async (seconds: number) => {
    const next = leads.includes(seconds)
      ? leads.filter((s) => s !== seconds)
      : [...leads, seconds].sort((a, b) => b - a);
    setLeads(next);
    setSaving(true);
    try {
      await fetch("/api/auth/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warningLeadsSeconds: next }),
      });
    } finally {
      setSaving(false);
    }
  };

  const formatLead = (seconds: number) =>
    seconds >= 60 ? `${seconds / 60} min before throw` : `${seconds}s before throw`;

  return (
    <section className="p-4 mb-6 bg-rally-surface border border-rally-border rounded-lg text-sm">
      <p className="text-rally-muted text-xs mb-2">NOTIFICATION PREFERENCES</p>

      <div className="mb-3 space-y-1">
        <p className="text-rally-muted text-[10px] font-bold">ALWAYS SENT</p>
        <label className="flex items-center gap-2 text-rally-text">
          <input type="checkbox" checked disabled />
          Rally Timer Started
        </label>
        <label className="flex items-center gap-2 text-rally-text">
          <input type="checkbox" checked disabled />
          Throw Rally Now
        </label>
      </div>

      <div className="pt-3 border-t border-rally-border space-y-1">
        <p className="text-rally-muted text-[10px] font-bold mb-1">OPTIONAL WARNINGS</p>
        <p className="text-rally-muted text-xs mb-2">
          Choose how early you want countdown alerts before your throw.
        </p>
        {allowed.map((seconds) => (
          <label key={seconds} className="flex items-center gap-2 mb-1">
            <input
              type="checkbox"
              checked={leads.includes(seconds)}
              disabled={saving}
              onChange={() => toggleLead(seconds)}
            />
            {formatLead(seconds)}
          </label>
        ))}
      </div>
    </section>
  );
}
