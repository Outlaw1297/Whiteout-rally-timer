/**
 * One phone can mint many Web Push endpoints. Canonical selection must keep
 * one row per deviceId (or per UA when deviceId is missing).
 */
import { selectCanonicalSubscriptions } from "../src/lib/device-id";

function assert(condition: unknown, label: string) {
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
  console.log(`PASS ${label}`);
}

const phoneA = [
  {
    id: "old",
    deviceId: null,
    userAgent: "iPhone Safari",
    updatedAt: new Date("2026-08-14T14:00:00Z"),
    lastSeenAt: new Date("2026-08-14T14:00:00Z"),
  },
  {
    id: "new",
    deviceId: null,
    userAgent: "iPhone Safari",
    updatedAt: new Date("2026-08-14T14:14:17Z"),
    lastSeenAt: new Date("2026-08-14T14:14:17Z"),
  },
];

const collapsed = selectCanonicalSubscriptions(phoneA);
assert(collapsed.length === 1, "identical UA clones collapse to one device");
assert(collapsed[0]?.id === "new", "keeps the newest endpoint");

const withIds = [
  {
    id: "phone1-old",
    deviceId: "11111111-1111-4111-8111-111111111111",
    userAgent: "iPhone Safari",
    updatedAt: new Date("2026-08-14T14:00:00Z"),
    lastSeenAt: null,
  },
  {
    id: "phone1-new",
    deviceId: "11111111-1111-4111-8111-111111111111",
    userAgent: "iPhone Safari",
    updatedAt: new Date("2026-08-14T14:14:17Z"),
    lastSeenAt: new Date("2026-08-14T14:14:17Z"),
  },
  {
    id: "phone2",
    deviceId: "22222222-2222-4222-8222-222222222222",
    userAgent: "iPhone Safari",
    updatedAt: new Date("2026-08-14T14:10:00Z"),
    lastSeenAt: new Date("2026-08-14T14:10:00Z"),
  },
];

const twoPhones = selectCanonicalSubscriptions(withIds);
assert(twoPhones.length === 2, "two deviceIds stay two devices even with the same UA");
assert(
  twoPhones.some((s) => s.id === "phone1-new") && twoPhones.some((s) => s.id === "phone2"),
  "keeps latest endpoint per deviceId plus the other phone"
);

console.log("All device-id tests passed.");
