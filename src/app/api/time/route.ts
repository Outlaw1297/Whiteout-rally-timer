import { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/api";
import { getServerTime, calculateClockOffset } from "@/lib/time";
import { rateLimit, RATE_LIMITS, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const clientSendHeader = request.headers.get("x-client-send-time");

  if (clientSendHeader) {
    const clientSendTime = parseInt(clientSendHeader, 10);
    const serverReceiveTime = Date.now();
    const serverTime = getServerTime();
    const serverSendTime = Date.now();

    const offset = calculateClockOffset(
      clientSendTime,
      serverReceiveTime,
      serverSendTime,
      serverSendTime
    );

    return jsonResponse({
      ...serverTime,
      offset,
      serverReceiveTime,
      serverSendTime,
    });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`time:${ip}`, RATE_LIMITS.api);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  return jsonResponse(getServerTime());
}
