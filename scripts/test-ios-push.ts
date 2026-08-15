/**
 * iOS Web Push cannot use silent calibration / live pings.
 * Those burns Apple's delivery budget: test still arrives, throw alerts stop.
 */
import { allowsSilentWebPush, detectPlatformFromUA } from "../src/lib/device-platform";

function assert(condition: unknown, label: string) {
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
  console.log(`PASS ${label}`);
}

const iphoneUa =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const androidUa =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

assert(!allowsSilentWebPush("iOS · Safari", iphoneUa), "iPhone UA cannot use silent web push");
assert(!allowsSilentWebPush("iOS · Safari", null), "stored iOS platform cannot use silent web push");
assert(allowsSilentWebPush("Android · Chrome", androidUa), "Android can use silent web push");
assert(allowsSilentWebPush("Windows · Edge", null), "desktop can use silent web push");
assert(detectPlatformFromUA(iphoneUa).startsWith("iOS"), "iPhone UA labeled iOS");

console.log("All iOS push-budget tests passed.");
