interface ConnectionIndicatorProps {
  isLive: boolean;
  label?: string;
}

export function ConnectionIndicator({ isLive, label }: ConnectionIndicatorProps) {
  const text =
    label ||
    (isLive ? "Synced" : "Reconnecting");

  return (
    <div
      className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"
      title={text}
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        {isLive ? (
          <span className="absolute inline-flex h-full w-full rounded-full bg-rally-success opacity-50 motion-safe:animate-ping" />
        ) : null}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            isLive ? "bg-rally-success" : "bg-rally-warning"
          }`}
        />
      </span>
      <span className={isLive ? "text-rally-success" : "text-rally-warning"}>{text}</span>
    </div>
  );
}
