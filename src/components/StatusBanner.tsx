"use client";

import { CheckCircle2, AlertTriangle, X } from "lucide-react";

/** Inline success / error banner used after saves and account changes. */
export function StatusBanner({
  success,
  error,
  onDismiss,
}: {
  success?: string | null;
  error?: string | null;
  onDismiss?: () => void;
}) {
  if (!success && !error) return null;

  const isError = Boolean(error);

  return (
    <div
      className={`mb-3 rounded-xl border px-3 py-3 text-sm page-enter ${
        isError
          ? "bg-rally-danger/10 border-rally-danger/50 text-rally-danger"
          : "bg-rally-success/10 border-rally-success/50 text-rally-success"
      }`}
      role="status"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {isError ? (
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          )}
          <p className="leading-snug">{error || success}</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-rally-muted hover:text-rally-snow shrink-0 p-1 -m-1"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
