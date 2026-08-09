interface ConnectionIndicatorProps {
  isLive: boolean;
}

export function ConnectionIndicator({ isLive }: ConnectionIndicatorProps) {
  return (
    <div className="flex items-center gap-2 text-sm font-mono">
      <span
        className={`inline-block w-2 h-2 rounded-full ${
          isLive ? "bg-rally-success animate-pulse" : "bg-rally-muted"
        }`}
      />
      <span className={isLive ? "text-rally-success" : "text-rally-muted"}>
        {isLive ? "LIVE" : "RECONNECTING"}
      </span>
    </div>
  );
}
