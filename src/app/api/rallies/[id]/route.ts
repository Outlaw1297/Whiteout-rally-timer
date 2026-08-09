import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid, parseRallyTime } from "@/lib/api";
import { getServerTime } from "@/lib/time";
import { rateLimit, RATE_LIMITS, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid rally ID", 400);

  const rally = await prisma.rally.findUnique({
    where: { id },
    include: {
      notificationLogs: {
        orderBy: { scheduledAt: "asc" },
      },
      _count: { select: { subscribers: true } },
    },
  });

  if (!rally) return errorResponse("Rally not found", 404);

  return jsonResponse({
    id: rally.id,
    title: rally.title,
    rallyTime: rally.rallyTime.toISOString(),
    status: rally.status,
    cancelled: rally.cancelled,
    isTestMode: rally.isTestMode,
    createdAt: rally.createdAt.toISOString(),
    updatedAt: rally.updatedAt.toISOString(),
    subscriberCount: rally._count.subscribers,
    notifications: {
      notification30Sent: rally.notification30Sent,
      notification10Sent: rally.notification10Sent,
      notification5Sent: rally.notification5Sent,
      notification1Sent: rally.notification1Sent,
      notificationNowSent: rally.notificationNowSent,
    },
    notificationLogs: rally.notificationLogs.map((log) => ({
      notificationType: log.notificationType,
      scheduledAt: log.scheduledAt.toISOString(),
      sentAt: log.sentAt?.toISOString() || null,
      latencyMs: log.latencyMs,
      success: log.success,
      errorMessage: log.errorMessage,
    })),
    serverTime: getServerTime(),
  });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const ip = getClientIp(request);
  const limit = rateLimit(`api:${ip}`, RATE_LIMITS.api);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid rally ID", 400);

  const rally = await prisma.rally.findUnique({ where: { id } });
  if (!rally) return errorResponse("Rally not found", 404);
  if (rally.cancelled) return errorResponse("Cannot modify a cancelled rally", 400);
  if (rally.rallyTime.getTime() <= Date.now()) {
    return errorResponse("Cannot modify a rally that has already started", 400);
  }

  let body: { title?: string; rallyTime?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const updateData: { title?: string; rallyTime?: Date } = {};

  if (body.title !== undefined) {
    if (body.title.trim().length === 0) return errorResponse("Title cannot be empty");
    if (body.title.length > 100) return errorResponse("Title must be 100 characters or less");
    updateData.title = body.title.trim();
  }

  if (body.rallyTime !== undefined) {
    const rallyTime = parseRallyTime(body.rallyTime);
    if (!rallyTime) return errorResponse("Invalid rally time format");
    if (rallyTime.getTime() <= Date.now()) {
      return errorResponse("Rally time must be in the future");
    }
    updateData.rallyTime = rallyTime;
    // Reset notification flags when time changes
    await prisma.rally.update({
      where: { id },
      data: {
        notification30Sent: false,
        notification10Sent: false,
        notification5Sent: false,
        notification1Sent: false,
        notificationNowSent: false,
      },
    });
  }

  if (Object.keys(updateData).length === 0) {
    return errorResponse("No valid fields to update");
  }

  const updated = await prisma.rally.update({
    where: { id },
    data: updateData,
  });

  logger.rallyModified(id, {
    title: updateData.title,
    rallyTime: updateData.rallyTime?.toISOString(),
  });

  return jsonResponse({
    id: updated.id,
    title: updated.title,
    rallyTime: updated.rallyTime.toISOString(),
    status: updated.status,
    serverTime: getServerTime(),
  });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid rally ID", 400);

  const rally = await prisma.rally.findUnique({ where: { id } });
  if (!rally) return errorResponse("Rally not found", 404);
  if (rally.cancelled) return errorResponse("Rally already cancelled", 400);

  await prisma.rally.update({
    where: { id },
    data: { cancelled: true, status: "CANCELLED" },
  });

  logger.rallyCancelled(id);

  return jsonResponse({ success: true, id });
}
