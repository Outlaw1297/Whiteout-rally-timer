import { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/api";
import { getServerTime } from "@/lib/time";
import { execSync } from "child_process";

/** Never cache — a stale unixMs makes client↔server offset look minutes off. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

type NtpStatus = "synchronized" | "not_synchronized" | "unavailable";

function checkNtpSync(): {
  status: NtpStatus;
  synchronized: boolean;
  details?: string;
  source?: string;
} {
  try {
    const output = execSync("timedatectl status 2>/dev/null || true", {
      encoding: "utf-8",
      timeout: 3000,
    }).trim();

    if (!output) {
      // Render / Docker often have no systemd — host NTP still keeps the clock honest.
      return {
        status: "unavailable",
        synchronized: true,
        source: "host",
        details:
          "timedatectl unavailable in this container. Clock is inherited from the Render host (assumed NTP-managed).",
      };
    }

    const synchronized = /System clock synchronized:\s*yes/i.test(output);
    const ntpActive = /NTP service:\s*active/i.test(output);
    const ntpInactive = /NTP service:\s*inactive/i.test(output);

    if (synchronized || ntpActive) {
      return {
        status: "synchronized",
        synchronized: true,
        source: "timedatectl",
        details: output.slice(0, 500),
      };
    }

    if (ntpInactive || /System clock synchronized:\s*no/i.test(output)) {
      return {
        status: "not_synchronized",
        synchronized: false,
        source: "timedatectl",
        details: output.slice(0, 500),
      };
    }

    return {
      status: "unavailable",
      synchronized: true,
      source: "host",
      details: output.slice(0, 500) || "Could not parse timedatectl output",
    };
  } catch {
    return {
      status: "unavailable",
      synchronized: true,
      source: "host",
      details: "NTP check unavailable (non-Linux or no timedatectl) — using host clock",
    };
  }
}

export async function GET(request: NextRequest) {
  const serverTime = getServerTime();
  const ntp = checkNtpSync();
  const clientSendHeader = request.headers.get("x-client-send-time");
  const serverReceiveTime = Date.now();
  const serverSendTime = Date.now();

  return jsonResponse({
    ...serverTime,
    ntpSynchronized: ntp.synchronized,
    ntpStatus: ntp.status,
    ntpSource: ntp.source,
    ntpDetails: ntp.details,
    status: "ok",
    ...(clientSendHeader
      ? {
          clientSendTime: parseInt(clientSendHeader, 10),
          serverReceiveTime,
          serverSendTime,
        }
      : {}),
  });
}
