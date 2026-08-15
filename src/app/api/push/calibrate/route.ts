import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { rateLimit, RATE_LIMITS, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import {
  CALIBRATION_PING_COUNT,
  getCalibrationStatus,
  sendCalibrationPings,
  userHasActiveRally,
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

  let body: { mode?: string; silent?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const mode = body.mode === "live" ? "live" : "setup";
  const silent = body.silent !== false;

  // Any live-ping attempt means the app is open — mark presence even if we skip sending.
  if (mode === "live") {
    await prisma.user.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }

  const limitKey =
    mode === "live" ? `push-calibrate-live:${session.id}` : `push-calibrate:${ip}`;
  const limitConfig =
    mode === "live"
      ? { windowMs: 2 * 60_000, maxRequests: 2 }
      : RATE_LIMITS.pushSubscribe;
  const limit = rateLimit(limitKey, limitConfig);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  if (mode === "live") {
    const busy = await userHasActiveRally(session.id, session.role);
    if (busy) {
      return errorResponse("Skip live ping while a rally timer is active", 409);
    }
  }

  const before = await getCalibrationStatus(session.id);
  const result = await sendCalibrationPings(session.id, { mode, silent });

  if ("error" in result) {
    return errorResponse(result.error!, result.status);
  }

  return jsonResponse({
    started: true,
    mode,
    skippedIos: "skippedIos" in result ? result.skippedIos : false,
    total: result.total ?? CALIBRATION_PING_COUNT,
    pings: result.pings,
    samplesBefore: before.totalSamples,
  });
}
