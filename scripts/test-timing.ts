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
} from "../src/lib/timing";
import { formatTimeLocal } from "../src/lib/time";

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
const shortLead = getNotificationSchedule(firstLaunch, true, true, true, {
  warn3: true,
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
console.log("PASS skip impossible warnings for short first-caller lead");

const compensated = getNotificationSchedule(
  new Date(goTime.getTime() + 15_000),
  true,
  false,
  true,
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
