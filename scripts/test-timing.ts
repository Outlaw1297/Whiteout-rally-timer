/**
 * Verifies launch time calculations match the master spec example.
 */
import {
  calculateLaunchTime,
  calculateExpectedArrival,
  computeTargetArrivalOnGo,
  DEFAULT_GATHER_SECONDS,
  getNextCaller,
  getNotificationSchedule,
  resolveLateNotificationPresentation,
  shouldSkipNotification,
} from "../src/lib/timing";
import { formatTimeLocal } from "../src/lib/time";
import {
  applyServerTimeSync,
  applyNtpSample,
  createMonotonicAnchor,
  readMonotonicNow,
} from "../src/lib/clock-sync";
import { getEffectivePushLeadMs, nextDeliveryLeadMs } from "../src/lib/delivery-lead";
import { allCallersHaveCalled, callerHasCalled } from "../src/lib/caller-launch";

function assertEqual(actual: Date, expectedHour: number, expectedMin: number, expectedSec: number, label: string) {
  const h = actual.getHours();
  const m = actual.getMinutes();
  const s = actual.getSeconds();
  if (h !== expectedHour || m !== expectedMin || s !== expectedSec) {
    console.error(`FAIL ${label}: got ${formatTimeLocal(actual)} expected ${expectedHour}:${String(expectedMin).padStart(2, "0")}:${String(expectedSec).padStart(2, "0")}`);
    process.exit(1);
  }
  console.log(`PASS ${label}: ${formatTimeLocal(actual)}`);
}

// Target: 10:00:00 PM, Gather: 5:00 (300s)
const target = new Date();
target.setHours(22, 0, 0, 0);
const gather = DEFAULT_GATHER_SECONDS;

const cases = [
  { name: "Alice", march: 8 * 60, launch: [21, 47, 0] },
  { name: "Bob", march: 6 * 60 + 30, launch: [21, 48, 30] },
  { name: "Charlie", march: 4 * 60 + 15, launch: [21, 50, 45] },
  { name: "Dave", march: 2 * 60, launch: [21, 53, 0] },
];

for (const c of cases) {
  const launch = calculateLaunchTime(target, gather, c.march);
  assertEqual(launch, c.launch[0], c.launch[1], c.launch[2], c.name);

  const arrival = calculateExpectedArrival(launch, gather, c.march);
  assertEqual(arrival, 22, 0, 0, `${c.name} arrival`);
}

console.log("\nAll timing tests passed.");

// GO workflow: target = now + gather + max march
const goStart = new Date();
goStart.setHours(19, 0, 0, 0);
const marches = [480, 390, 255, 120];
const targetOnGo = computeTargetArrivalOnGo(goStart, 300, marches);
assertEqual(targetOnGo, 19, 13, 3, "GO target arrival");

const aliceLaunch = calculateLaunchTime(targetOnGo, 300, 480);
assertEqual(aliceLaunch, 19, 0, 3, "GO Alice launch (longest march throws first)");

console.log("\nGO workflow tests passed.");

// Next caller progression
const base = Date.now();
const assignments = [
  { id: "1", displayName: "call4", launchTime: new Date(base + 10_000).toISOString(), status: "WAITING" },
  { id: "2", displayName: "call2", launchTime: new Date(base + 20_000).toISOString(), status: "WAITING" },
  { id: "3", displayName: "call3", launchTime: new Date(base + 30_000).toISOString(), status: "WAITING" },
];

const first = getNextCaller(assignments, base + 5_000);
if (first?.assignmentId !== "1") {
  console.error("FAIL next caller before first launch");
  process.exit(1);
}

const second = getNextCaller(assignments, base + 15_000);
if (second?.assignmentId !== "2") {
  console.error("FAIL next caller after first launch");
  process.exit(1);
}

const third = getNextCaller(assignments, base + 25_000);
if (third?.assignmentId !== "3") {
  console.error("FAIL next caller after second launch");
  process.exit(1);
}

const jointMarch = [
  { id: "a", displayName: "call2", launchTime: new Date(base + 20_000).toISOString(), status: "WAITING" },
  { id: "b", displayName: "call3", launchTime: new Date(base + 20_000).toISOString(), status: "WAITING" },
];
const joint = getNextCaller(jointMarch, base + 15_000);
if (joint?.displayName !== "call2, call3" || joint.assignmentIds.length !== 2) {
  console.error("FAIL joint next caller names");
  process.exit(1);
}
console.log("PASS joint next caller names");

const overdue = getNextCaller(assignments, base + 35_000);
if (overdue?.assignmentId !== "1") {
  console.error("FAIL next caller when all overdue");
  process.exit(1);
}

console.log("PASS next caller progression");
console.log("\nAll timing tests passed.");

// Notification schedule: skip warnings that cannot fit before first caller
const goTime = new Date();
const firstLaunch = new Date(goTime.getTime() + 5_000);
const shortLead = getNotificationSchedule(firstLaunch, [10, 5, 3], {
  referenceTime: goTime,
  pushLeadMs: 0,
});
const shortTypes = shortLead.map((e) => e.type);
if (shortTypes.includes("WARNING_10")) {
  console.error("FAIL should skip 10s warning when only 5s until launch");
  process.exit(1);
}
if (!shortTypes.includes("WARNING_5") || !shortTypes.includes("LAUNCH")) {
  console.error("FAIL should keep 5s warning and launch for 5s lead");
  process.exit(1);
}
if (!shortTypes.includes("LAUNCH")) {
  console.error("FAIL LAUNCH must always be scheduled");
  process.exit(1);
}
console.log("PASS skip impossible warnings for short first-caller lead");

const compensated = getNotificationSchedule(
  new Date(goTime.getTime() + 15_000),
  [10],
  {
    referenceTime: goTime,
    pushLeadMs: 1000,
  }
);
const warn10 = compensated.find((e) => e.type === "WARNING_10");
if (!warn10 || warn10.scheduledAt.getTime() !== goTime.getTime() + 15_000 - 11_000) {
  console.error("FAIL push lead compensation on 10s warning");
  process.exit(1);
}
console.log("PASS push delivery lead compensation");

// Later caller with only 6s until launch (e.g. linked mid-rally)
const laterLaunch = new Date(goTime.getTime() + 6_000);
const laterSchedule = getNotificationSchedule(laterLaunch, [10, 5, 3], {
  referenceTime: goTime,
  pushLeadMs: 0,
});
const laterTypes = laterSchedule.map((e) => e.type);
if (laterTypes.includes("WARNING_10") || !laterTypes.includes("WARNING_5")) {
  console.error("FAIL later caller should skip 10s but keep 5s when 6s remain");
  process.exit(1);
}
console.log("PASS skip impossible warnings for any caller");

if (!shouldSkipNotification("WARNING_10", laterLaunch, goTime)) {
  console.error("FAIL shouldSkipNotification for stale 10s warning");
  process.exit(1);
}
if (shouldSkipNotification("LAUNCH", laterLaunch, goTime)) {
  console.error("FAIL should never skip LAUNCH");
  process.exit(1);
}
if (shouldSkipNotification("RALLY_STARTED", laterLaunch, goTime)) {
  console.error("FAIL should never skip RALLY_STARTED");
  process.exit(1);
}
const scheduled10 = new Date(laterLaunch.getTime() - 10_000);
if (shouldSkipNotification("WARNING_10", laterLaunch, goTime, scheduled10)) {
  console.error("FAIL should honor scheduledAt even when lead time is short");
  process.exit(1);
}
console.log("PASS runtime stale notification skip");

const withStart = getNotificationSchedule(firstLaunch, [5], {
  referenceTime: goTime,
  includeRallyStarted: true,
  startedAt: goTime,
  pushLeadMs: 0,
});
if (!withStart.some((e) => e.type === "RALLY_STARTED") || !withStart.some((e) => e.type === "LAUNCH")) {
  console.error("FAIL required rally started + launch notifications");
  process.exit(1);
}
console.log("PASS required rally-started and launch alerts");

const anchor = createMonotonicAnchor(1_000_000);
const nudged = applyServerTimeSync(anchor, 1_000_080);
const nudgedNow = readMonotonicNow(nudged);
if (nudgedNow < 1_000_035 || nudgedNow > 1_000_085) {
  console.error("FAIL gentle clock nudge", nudgedNow);
  process.exit(1);
}
const snapAnchor = createMonotonicAnchor(1_000_000);
const snapped = applyServerTimeSync(snapAnchor, 1_001_000);
if (Math.abs(readMonotonicNow(snapped) - 1_001_000) > 5) {
  console.error("FAIL large clock snap");
  process.exit(1);
}
const ntp = applyNtpSample(anchor, 1000, 1050, 1052, 1100);
if (Math.abs(ntp.offset - 1) > 2) {
  console.error("FAIL NTP offset calculation", ntp.offset);
  process.exit(1);
}
console.log("PASS monotonic clock sync");

const learned = nextDeliveryLeadMs(1000, 250, 3);
if (learned.deliveryLeadMs < 1000 || learned.deliveryLeadMs > 1200) {
  console.error("FAIL adaptive delivery lead", learned);
  process.exit(1);
}
if (getEffectivePushLeadMs(500, [{ deliveryLeadMs: 900 }, { deliveryLeadMs: 1200 }]) !== 1200) {
  console.error("FAIL effective push lead uses max device lead");
  process.exit(1);
}
console.log("PASS adaptive delivery lead");

// Arrival offsets: call1=0, call3=2, call2=4 → staggered hits
{
  const go = new Date();
  go.setHours(20, 0, 0, 0);
  const marches = [480, 390, 255]; // call1, call3, call2
  const offsets = [0, 2, 4];
  const target = computeTargetArrivalOnGo(go, 300, marches, 3, offsets);
  const launch1 = calculateLaunchTime(target, 300, 480, 0);
  const launch3 = calculateLaunchTime(target, 300, 390, 2);
  const launch2 = calculateLaunchTime(target, 300, 255, 4);
  const arrive1 = calculateExpectedArrival(launch1, 300, 480);
  const arrive3 = calculateExpectedArrival(launch3, 300, 390);
  const arrive2 = calculateExpectedArrival(launch2, 300, 255);

  if (arrive3.getTime() - arrive1.getTime() !== 2000) {
    console.error("FAIL offset stagger call3 vs call1", arrive3.getTime() - arrive1.getTime());
    process.exit(1);
  }
  if (arrive2.getTime() - arrive1.getTime() !== 4000) {
    console.error("FAIL offset stagger call2 vs call1");
    process.exit(1);
  }
  if (launch1.getTime() !== go.getTime() + 3000) {
    console.error("FAIL first launch should be GO + lead with offsets", launch1.toISOString());
    process.exit(1);
  }
  console.log("PASS arrival offset stagger order");
}

{
  const now = Date.now();
  if (!callerHasCalled({ status: "LAUNCHED", launchTime: null }, now)) {
    console.error("FAIL launched caller counts as called");
    process.exit(1);
  }
  if (
    !callerHasCalled(
      { status: "WAITING", launchTime: new Date(now - 1000) },
      now
    )
  ) {
    console.error("FAIL past launch time counts as called");
    process.exit(1);
  }
  if (
    callerHasCalled(
      { status: "WAITING", launchTime: new Date(now + 60_000) },
      now
    )
  ) {
    console.error("FAIL future launch should not count as called");
    process.exit(1);
  }
  if (
    !allCallersHaveCalled(
      [
        { status: "LAUNCHED", launchTime: new Date(now + 60_000) },
        { status: "WAITING", launchTime: new Date(now - 500) },
      ],
      now
    )
  ) {
    console.error("FAIL all callers have called when mixed confirm + past launch");
    process.exit(1);
  }
  if (
    allCallersHaveCalled(
      [
        { status: "WAITING", launchTime: new Date(now - 500) },
        { status: "WAITING", launchTime: new Date(now + 60_000) },
      ],
      now
    )
  ) {
    console.error("FAIL should wait for last caller");
    process.exit(1);
  }
  console.log("PASS complete after last caller helpers");
}

{
  const launch = new Date();
  launch.setSeconds(launch.getSeconds() + 10);
  const nowEarly = launch.getTime() - 10_000;
  const onTime = resolveLateNotificationPresentation(
    "WARNING_10",
    launch,
    nowEarly,
    { title: "10s — almost throw time", body: "Castle · CALLER" }
  );
  if (onTime.escalated || onTime.title !== "10s — almost throw time") {
    console.error("FAIL on-time warning should not escalate", onTime);
    process.exit(1);
  }

  const late = resolveLateNotificationPresentation(
    "WARNING_10",
    launch,
    launch.getTime() - 4_000,
    { title: "10s — almost throw time", body: "Castle · CALLER" }
  );
  if (!late.escalated || !late.title.includes("4s")) {
    console.error("FAIL late warning should show remaining seconds", late);
    process.exit(1);
  }

  const veryLate = resolveLateNotificationPresentation(
    "WARNING_10",
    launch,
    launch.getTime() - 1_000,
    { title: "10s — almost throw time", body: "Castle · CALLER" }
  );
  if (veryLate.type !== "LAUNCH" || !veryLate.title.includes("THROW")) {
    console.error("FAIL imminent warning should escalate to LAUNCH", veryLate);
    process.exit(1);
  }
  console.log("PASS late warning presentation escalation");
}

{
  const go = new Date();
  go.setMilliseconds(0);
  const launch = new Date(go.getTime() + 3000);
  const schedule = getNotificationSchedule(launch, [10, 5], {
    referenceTime: go,
    pushLeadMs: 3273,
    includeRallyStarted: true,
    startedAt: go,
  });
  const launchRow = schedule.find((s) => s.type === "LAUNCH");
  if (!launchRow) {
    console.error("FAIL LAUNCH missing from short first-caller schedule");
    process.exit(1);
  }
  if (launchRow.scheduledAt.getTime() < go.getTime()) {
    console.error(
      "FAIL high delivery lead must not schedule LAUNCH before GO",
      launchRow.scheduledAt.toISOString(),
      go.toISOString()
    );
    process.exit(1);
  }
  const started = schedule.find((s) => s.type === "RALLY_STARTED");
  if (!started) {
    console.error("FAIL RALLY_STARTED missing");
    process.exit(1);
  }
  console.log("PASS high delivery lead capped to GO for short first-caller window");
}



