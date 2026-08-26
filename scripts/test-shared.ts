/**
 * Shared package smoke tests — parse + schedule helpers used by web and mobile.
 */
import {
  getNotificationSchedule,
  parseGatherDuration,
  parseMarchDuration,
} from "../packages/shared/src/index";

function assert(cond: boolean, label: string) {
  if (!cond) throw new Error(`FAIL ${label}`);
  console.log(`PASS ${label}`);
}

assert(parseMarchDuration("8:00") === 480, "8:00 → 480");
assert(parseMarchDuration("12:37") === 12 * 60 + 37, "12:37");
assert(parseMarchDuration("100:00") === 6000, "100:00 allowed (≤999 minutes)");
assert(parseMarchDuration("8:60") === null, "8:60 rejected");
assert(parseMarchDuration("abc") === null, "garbage rejected");
assert(parseGatherDuration("5:00") === 300, "gather 5:00");

const launch = new Date("2026-01-01T12:00:00.000Z");
const ref = new Date("2026-01-01T11:59:00.000Z");
const local = getNotificationSchedule(launch, [10, 5], {
  referenceTime: ref,
  pushLeadMs: 0,
  includeRallyStarted: false,
});
assert(local.some((e) => e.type === "LAUNCH"), "local schedule includes LAUNCH");
assert(local.some((e) => e.type === "WARNING_10"), "local schedule includes WARNING_10");
const launchEntry = local.find((e) => e.type === "LAUNCH")!;
assert(launchEntry.scheduledAt.getTime() === launch.getTime(), "local LAUNCH at target (no lead)");

const remote = getNotificationSchedule(launch, [10], {
  referenceTime: ref,
  pushLeadMs: 1000,
});
const remoteLaunch = remote.find((e) => e.type === "LAUNCH")!;
assert(
  remoteLaunch.scheduledAt.getTime() === launch.getTime() - 1000,
  "remote LAUNCH early by pushLeadMs"
);

console.log("All shared package tests passed.");
