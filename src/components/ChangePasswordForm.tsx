"use client";

import { useState } from "react";
import { Panel, SectionLabel } from "@/components/ui/AppShell";

export function ChangePasswordForm({ title = "Change Password" }: { title?: string }) {
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
    <Panel className="mb-4">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>{title}</SectionLabel>
        {!expanded && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setExpanded(true);
            }}
            className="btn-ghost text-xs font-semibold text-rally-ice !px-2"
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
            className="input-field text-sm"
            required
          />
          <input
            type="password"
            placeholder="New password (8+ characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            className="input-field text-sm"
            required
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            className="input-field text-sm"
            required
          />

          {error && <p className="text-rally-danger text-xs">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex-1 !min-h-[40px] text-sm"
            >
              {loading ? "Saving..." : "Save Password"}
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setExpanded(false);
              }}
              className="btn-ghost text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}
