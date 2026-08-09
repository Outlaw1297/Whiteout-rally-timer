/**
 * Verifies launch time calculations match the master spec example.
 */
import {
  calculateLaunchTime,
  calculateExpectedArrival,
  computeTargetArrivalOnGo,
  DEFAULT_GATHER_SECONDS,
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
assertEqual(targetOnGo, 19, 13, 0, "GO target arrival");

const aliceLaunch = calculateLaunchTime(targetOnGo, 300, 480);
assertEqual(aliceLaunch, 19, 0, 0, "GO Alice launch (longest march throws first)");

console.log("\nGO workflow tests passed.");
