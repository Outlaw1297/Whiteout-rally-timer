"use client";

import { useState } from "react";

export function ChangePasswordForm({ title = "CHANGE PASSWORD" }: { title?: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to change password");
        return;
      }

      resetForm();
      setSuccess(true);
      setExpanded(false);
      setTimeout(() => setSuccess(false), 4000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="p-4 mb-4 bg-rally-surface border border-rally-border rounded-lg">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-rally-muted text-xs">{title}</h2>
        {!expanded && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setExpanded(true);
            }}
            className="text-rally-accent text-xs font-bold"
          >
            Change
          </button>
        )}
      </div>

      {success && (
        <p className="text-rally-success text-sm mt-2">Password updated successfully.</p>
      )}

      {expanded && (
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className="px-3 py-2 bg-rally-bg border border-rally-border rounded text-sm"
            required
          />
          <input
            type="password"
            placeholder="New password (8+ characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            className="px-3 py-2 bg-rally-bg border border-rally-border rounded text-sm"
            required
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            className="px-3 py-2 bg-rally-bg border border-rally-border rounded text-sm"
            required
          />

          {error && <p className="text-rally-danger text-xs">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-rally-accent text-white text-sm font-bold rounded disabled:opacity-50"
            >
              {loading ? "SAVING..." : "SAVE PASSWORD"}
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setExpanded(false);
              }}
              className="px-3 py-2 text-rally-muted text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
