/**
 * Activity log helpers + logout unbind safety: never deactivate every device
 * on an account when endpoint/deviceId are missing.
 */
import { buildUnbindWhere } from "../src/lib/unbind-device";
import {
  activityKindGroup,
  activityKindLabel,
  formatPushTestRow,
  isActivityKind,
  kindsForGroup,
  pushEndpointHost,
  pushResultToActivity,
  summarizePushTestResults,
} from "../src/lib/activity-log";

function assert(condition: unknown, label: string) {
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
  console.log(`PASS ${label}`);
}

assert(
  buildUnbindWhere({ userId: "user-1" }) === null,
  "logout without endpoint/deviceId unbinds nothing"
);
assert(
  buildUnbindWhere({ userId: "", endpoint: "https://push.example/x" }) === null,
  "unbind requires a user id"
);

const byEndpoint = buildUnbindWhere({
  userId: "user-1",
  endpoint: "https://web.push.apple.com/abc",
});
assert(byEndpoint?.userId === "user-1", "unbind scoped to this user");
assert(byEndpoint?.active === true, "unbind only touches active rows");
assert(
  byEndpoint?.OR.some((clause) => "endpoint" in clause && clause.endpoint.includes("apple")),
  "unbind matches this browser endpoint"
);

const byDevice = buildUnbindWhere({
  userId: "user-1",
  deviceId: "11111111-1111-4111-8111-111111111111",
});
assert(
  byDevice?.OR.some(
    (clause) => "deviceId" in clause && clause.deviceId === "11111111-1111-4111-8111-111111111111"
  ),
  "unbind matches this install id"
);
assert(
  !JSON.stringify(byDevice).includes('"userId":{"equals"') && byDevice?.OR.length === 1,
  "device-id unbind does not add a catch-all clause"
);

const both = buildUnbindWhere({
  userId: "user-1",
  endpoint: "https://fcm.googleapis.com/x",
  deviceId: "22222222-2222-4222-8222-222222222222",
});
assert(both?.OR.length === 2, "endpoint and deviceId are OR-matched for this user only");

assert(activityKindGroup("LOGIN") === "auth", "login grouped as auth");
assert(activityKindGroup("DEVICE_REGISTER") === "device", "register grouped as device");
assert(activityKindGroup("SW_HEALTH") === "device", "worker health grouped as device");
assert(activityKindGroup("PUSH_SKIPPED") === "notification", "missed push grouped as notification");
assert(activityKindLabel("PUSH_SKIPPED") === "Push missed", "skipped labeled as missed");
assert(isActivityKind("PUSH_TEST"), "PUSH_TEST is a known kind");
assert(isActivityKind("SW_HEALTH"), "SW_HEALTH is a known kind");
assert(!isActivityKind("HACK"), "unknown kinds rejected");
assert(kindsForGroup("auth").includes("LOGOUT"), "logout listed under auth");

assert(
  pushEndpointHost("https://web.push.apple.com/abc?token=1") === "web.push.apple.com",
  "apple push host parsed"
);
assert(pushEndpointHost("not-a-url") === null, "bad endpoint has no host");

const summary = summarizePushTestResults([
  {
    subscriptionId: "a",
    user: "Test1",
    platform: "iOS",
    success: true,
    statusCode: 201,
    latencyMs: 120,
    endpointHost: "web.push.apple.com",
    deviceLabel: "ab12cd34",
  },
  {
    subscriptionId: "b",
    user: "Test2",
    platform: "Android",
    success: false,
    error: "Gone",
    statusCode: 410,
    deactivated: true,
    endpointHost: "fcm.googleapis.com",
  },
]);
assert(summary.devicesTested === 2, "test summary counts devices");
assert(summary.devicesNotified === 1, "test summary counts accepted");
assert(summary.headline.includes("1/2"), "headline shows accepted/tested");
assert(summary.detail.includes("stale"), "summary mentions deactivated endpoint");

const okRow = formatPushTestRow({
  subscriptionId: "a",
  user: "Test1",
  platform: "iOS",
  success: true,
  statusCode: 201,
  latencyMs: 42,
  endpointHost: "web.push.apple.com",
  deviceLabel: "ab12cd34",
});
assert(okRow.includes("Test1"), "test row includes user");
assert(okRow.includes("ab12cd34"), "test row includes short device id");
assert(okRow.includes("42ms"), "test row includes latency");

const failed = pushResultToActivity({
  success: false,
  displayName: "Test1",
  error: "no devices",
  skipped: true,
});
assert(failed.kind === "PUSH_SKIPPED", "no-device send is missed, not success");
assert(failed.success === false, "missed push is not success");

const sent = pushResultToActivity({ success: true, displayName: "Test1" });
assert(sent.kind === "PUSH_SENT", "accepted send logs PUSH_SENT");

console.log("All activity-log tests passed.");
