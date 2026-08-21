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

export function formatGather(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function parseMarchDuration(value: string): number | null {
  const trimmed = value.trim();
  const match = /^(\d+):([0-5]\d)$/.exec(trimmed);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
