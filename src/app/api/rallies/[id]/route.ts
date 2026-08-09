import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { rateLimit, RATE_LIMITS, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { serializeRally, canCancel, isController } from "@/lib/rally";
import { getServerTime } from "@/lib/time";
import {
  broadcastRallyStarted,
  broadcastRallyCancelled,
  broadcastRallyUpdate,
} from "@/server/rally-hub";

interface RouteParams {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid rally ID", 400);

  const rally = await prisma.rally.findUnique({
    where: { id },
    include: {
      notificationLogs: { orderBy: { scheduledAt: "asc" } },
      _count: { select: { subscribers: true } },
    },
  });

  if (!rally) return errorResponse("Rally not found", 404);

  return jsonResponse(serializeRally(rally));
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const ip = getClientIp(request);
  const limit = rateLimit(`api:${ip}`, RATE_LIMITS.api);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid rally ID", 400);

  const rally = await prisma.rally.findUnique({ where: { id } });
  if (!rally) return errorResponse("Rally not found", 404);
  if (!canCancel(rally)) return errorResponse("Cannot modify this rally", 400);
  if (rally.status !== "READY" && rally.status !== "DRAFT") {
    return errorResponse("Can only edit rally name before it starts", 400);
  }

  let body: { title?: string; controllerId?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  if (body.controllerId && !isController(rally, body.controllerId)) {
    return errorResponse("Only the rally controller can edit this rally", 403);
  }

  if (!body.title || body.title.trim().length === 0) {
    return errorResponse("Title is required");
  }

  if (body.title.length > 100) {
    return errorResponse("Title must be 100 characters or less");
  }

  const updated = await prisma.rally.update({
    where: { id },
    data: { title: body.title.trim() },
    include: {
      notificationLogs: { orderBy: { scheduledAt: "asc" } },
      _count: { select: { subscribers: true } },
    },
  });

  logger.rallyModified(id, { title: updated.title });
  const payload = serializeRally(updated);
  broadcastRallyUpdate(id, payload);

  return jsonResponse(payload);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid rally ID", 400);

  const rally = await prisma.rally.findUnique({ where: { id } });
  if (!rally) return errorResponse("Rally not found", 404);
  if (rally.cancelled) return errorResponse("Rally already cancelled", 400);

  let controllerId: string | undefined;
  try {
    const body = await request.json();
    controllerId = body.controllerId;
  } catch {
    // allow cancel without body for backwards compatibility
  }

  if (controllerId && !isController(rally, controllerId)) {
    return errorResponse("Only the rally controller can cancel this rally", 403);
  }

  await prisma.rally.update({
    where: { id },
    data: { cancelled: true, status: "CANCELLED" },
  });

  logger.rallyCancelled(id);
  broadcastRallyCancelled(id);

  return jsonResponse({ success: true, id, serverTime: getServerTime() });
}
