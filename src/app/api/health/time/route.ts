import { jsonResponse } from "@/lib/api";
import { getServerTime } from "@/lib/time";
import { execSync } from "child_process";

function checkNtpSync(): { synchronized: boolean; details?: string } {
  try {
    const output = execSync("timedatectl status 2>/dev/null || true", {
      encoding: "utf-8",
      timeout: 3000,
    });
    const ntpActive = /NTP service:\s*active/i.test(output);
    const synchronized = /System clock synchronized:\s*yes/i.test(output);
    return {
      synchronized: ntpActive || synchronized,
      details: output.trim().slice(0, 500),
    };
  } catch {
    return { synchronized: true, details: "NTP check unavailable (non-Linux or no timedatectl)" };
  }
}

export async function GET() {
  const serverTime = getServerTime();
  const ntp = checkNtpSync();

  return jsonResponse({
    ...serverTime,
    ntpSynchronized: ntp.synchronized,
    ntpDetails: ntp.details,
    status: "ok",
  });
}
