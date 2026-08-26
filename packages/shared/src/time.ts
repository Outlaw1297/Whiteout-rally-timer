/** NTP-style offset. Positive means server is ahead of client. */
export function calculateClockOffset(
  clientSendTime: number,
  serverReceiveTime: number,
  serverSendTime: number,
  clientReceiveTime: number
): number {
  return (
    (serverReceiveTime - clientSendTime + (serverSendTime - clientReceiveTime)) / 2
  );
}

export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "LAUNCH NOW";

  const totalSeconds = remainingMs / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.floor(remainingMs % 1000);

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function formatTimeLocal(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function formatArrivalTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatTimeLocal(new Date(iso));
}

/** Format seconds as M:SS (march or gather). */
export function formatDurationSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.abs(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const formatMarchDuration = formatDurationSeconds;
export const formatGatherDuration = formatDurationSeconds;
/** Alias used by the mobile UI. */
export const formatGather = formatDurationSeconds;

/**
 * Parse "8:00" / "12:37" → seconds.
 * Minutes 0–999, seconds 00–59. Same rules on web and mobile.
 */
export function parseMarchDuration(input: string): number | null {
  const trimmed = input.trim();
  const match = /^(\d{1,3}):([0-5]\d)$/.exec(trimmed);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function parseGatherDuration(input: string): number | null {
  return parseMarchDuration(input);
}
