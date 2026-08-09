export interface March {
  id: string;
  name: string;
  /** Total march travel time to the target, in seconds. */
  marchSeconds: number;
}

export interface LaunchPlanEntry extends March {
  /** Epoch ms at which this march must be launched to arrive at `arrivalMs`. */
  launchAtMs: number;
  /** ms until launch, relative to `nowMs` (negative once the launch is due/past). */
  msUntilLaunch: number;
  status: "waiting" | "launch" | "late";
}

/**
 * How long (ms) after the exact launch instant a march stays in the "launch now"
 * window before being considered late. Gives the player a moment to react.
 */
export const LAUNCH_WINDOW_MS = 10_000;

/**
 * Given a set of marches that must all arrive at `arrivalMs`, compute when each
 * one has to be launched. Marches are returned sorted by launch time (earliest
 * first) so the longest march — which must leave first — is at the top.
 */
export function computeLaunchPlan(
  marches: March[],
  arrivalMs: number,
  nowMs: number,
): LaunchPlanEntry[] {
  return marches
    .map((march) => {
      const launchAtMs = arrivalMs - march.marchSeconds * 1000;
      const msUntilLaunch = launchAtMs - nowMs;
      let status: LaunchPlanEntry["status"];
      if (msUntilLaunch > 0) {
        status = "waiting";
      } else if (msUntilLaunch > -LAUNCH_WINDOW_MS) {
        status = "launch";
      } else {
        status = "late";
      }
      return { ...march, launchAtMs, msUntilLaunch, status };
    })
    .sort((a, b) => a.launchAtMs - b.launchAtMs);
}

/** Parse "ss", "mm:ss" or "h:mm:ss" into a total number of seconds. */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  if (parts.length > 3) return null;

  const nums = parts.map((p) => Number(p));
  let seconds = 0;
  if (nums.length === 1) {
    seconds = nums[0];
  } else if (nums.length === 2) {
    seconds = nums[0] * 60 + nums[1];
  } else {
    seconds = nums[0] * 3600 + nums[1] * 60 + nums[2];
  }
  return Number.isFinite(seconds) ? seconds : null;
}

/** Format a number of seconds as "mm:ss" (or "h:mm:ss" when >= 1 hour). */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return "--:--";
  const negative = totalSeconds < 0;
  const abs = Math.abs(Math.round(totalSeconds));
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const seconds = abs % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const body =
    hours > 0
      ? `${hours}:${pad(minutes)}:${pad(seconds)}`
      : `${minutes}:${pad(seconds)}`;
  return negative ? `-${body}` : body;
}

/** Format an epoch-ms instant as a local wall-clock time (HH:MM:SS). */
export function formatClock(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return "--:--:--";
  const d = new Date(epochMs);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
