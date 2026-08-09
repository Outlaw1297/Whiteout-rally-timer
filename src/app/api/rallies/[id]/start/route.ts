import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { rateLimit, RATE_LIMITS, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import {
  serializeRally,
  canStart,
  isController,
  ALLOWED_START_DELAYS,
  NOTIFICATION_RESET,
} from "@/lib/rally";
import { broadcastRallyStarted } from "@/server/rally-hub";

interface RouteParams {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const ip = getClientIp(request);
  const limit = rateLimit(`api:${ip}`, RATE_LIMITS.api);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid rally ID", 400);

  const rally = await prisma.rally.findUnique({ where: { id } });
  if (!rally) return errorResponse("Rally not found", 404);
  if (!canStart(rally)) {
    return errorResponse("Rally cannot be started in its current state", 400);
  }

  let body: { delaySeconds?: number; controllerId?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  if (body.controllerId && !isController(rally, body.controllerId)) {
    return errorResponse("Only the rally controller can start this rally", 403);
  }

  const delaySeconds = Number(body.delaySeconds ?? 30);
  if (!ALLOWED_START_DELAYS.includes(delaySeconds as (typeof ALLOWED_START_DELAYS)[number])) {
    return errorResponse("delaySeconds must be 5, 10, 30, or 60");
  }

  const serverNow = Date.now();
  const rallyTime = new Date(serverNow + delaySeconds * 1000);
  const startedAt = new Date(serverNow);

  const updated = await prisma.rally.update({
    where: { id },
    data: {
      rallyTime,
      startedAt,
      startDelaySeconds: delaySeconds,
      status: "ACTIVE",
      ...NOTIFICATION_RESET,
    },
    include: {
      notificationLogs: { orderBy: { scheduledAt: "asc" } },
      _count: { select: { subscribers: true } },
    },
  });

  logger.info("rally_started", {
    rallyId: id,
    title: updated.title,
    rallyTime: rallyTime.toISOString(),
    delaySeconds,
  });

  const payload = serializeRally(updated);
  broadcastRallyStarted(id, payload);

  return jsonResponse({
    rallyId: updated.id,
    rallyTime: rallyTime.toISOString(),
    serverTime: payload.serverTime,
    rally: payload,
  });
}
