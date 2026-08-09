interface ConnectionIndicatorProps {
  isLive: boolean;
  label?: string;
}

export function ConnectionIndicator({ isLive, label }: ConnectionIndicatorProps) {
  return (
    <div className="flex items-center gap-2 text-sm font-mono">
      <span
        className={`inline-block w-2 h-2 rounded-full ${
          isLive ? "bg-rally-success" : "bg-rally-muted"
        }`}
      />
      <span className={isLive ? "text-rally-success" : "text-rally-muted"}>
        {label || (isLive ? "CONNECTED" : "RECONNECTING")}
      </span>
    </div>
  );
}
