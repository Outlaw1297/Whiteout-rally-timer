import { NextRequest } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { rateLimit, RATE_LIMITS, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import {
  CALIBRATION_PING_COUNT,
  getCalibrationStatus,
  sendCalibrationPings,
} from "@/lib/push-calibration";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  const status = await getCalibrationStatus(session.id);
  return jsonResponse(status);
}

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  const ip = getClientIp(request);
  const limit = rateLimit(`push-calibrate:${ip}`, RATE_LIMITS.pushSubscribe);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const before = await getCalibrationStatus(session.id);
  const result = await sendCalibrationPings(session.id);

  if ("error" in result) {
    return errorResponse(result.error!, result.status);
  }

  return jsonResponse({
    started: true,
    total: CALIBRATION_PING_COUNT,
    pings: result.pings,
    samplesBefore: before.totalSamples,
  });
}
