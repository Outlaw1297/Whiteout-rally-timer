"use client";

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

  return (
    <div
      className={`p-3 mb-3 rounded-lg text-sm border ${
        error
          ? "bg-rally-danger/20 border-rally-danger text-rally-danger"
          : "bg-rally-success/20 border-rally-success text-rally-success"
      }`}
      role="status"
    >
      <div className="flex items-start justify-between gap-2">
        <p>{error || success}</p>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-rally-muted text-xs shrink-0"
          >
            dismiss
          </button>
        )}
      </div>
    </div>
  );
}
