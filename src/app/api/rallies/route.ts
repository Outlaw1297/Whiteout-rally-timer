import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, parseRallyTime } from "@/lib/api";
import { getServerTime } from "@/lib/time";
import { rateLimit, RATE_LIMITS, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function GET() {
  const rallies = await prisma.rally.findMany({
    where: {
      cancelled: false,
      rallyTime: { gt: new Date(Date.now() - 60_000) },
    },
    orderBy: { rallyTime: "asc" },
    take: 50,
    select: {
      id: true,
      title: true,
      rallyTime: true,
      status: true,
      cancelled: true,
      isTestMode: true,
    },
  });

  return jsonResponse({ rallies });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(`rally-create:${ip}`, RATE_LIMITS.rallyCreate);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  let body: {
    title?: string;
    rallyTime?: string;
    createdBy?: string;
    isTestMode?: boolean;
    secondsFromNow?: number;
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { title, createdBy, isTestMode, secondsFromNow } = body;
  let rallyTime: Date | null = null;

  if (secondsFromNow !== undefined && isTestMode) {
    const seconds = Number(secondsFromNow);
    if (![5, 10, 30, 60].includes(seconds)) {
      return errorResponse("Test mode only supports 5, 10, 30, or 60 seconds from now");
    }
    rallyTime = new Date(Date.now() + seconds * 1000);
  } else if (body.rallyTime) {
    rallyTime = parseRallyTime(body.rallyTime);
    if (!rallyTime) return errorResponse("Invalid rally time format. Use ISO 8601 UTC.");
    if (rallyTime.getTime() <= Date.now()) {
      return errorResponse("Rally time must be in the future");
    }
  } else {
    return errorResponse("rallyTime or test mode secondsFromNow is required");
  }

  if (!title || title.trim().length === 0) {
    return errorResponse("Title is required");
  }

  if (title.length > 100) {
    return errorResponse("Title must be 100 characters or less");
  }

  const rally = await prisma.rally.create({
    data: {
      title: title.trim(),
      rallyTime,
      createdBy: createdBy || null,
      isTestMode: !!isTestMode,
      status: "SCHEDULED",
    },
  });

  logger.rallyCreated(rally.id, rally.title, rally.rallyTime.toISOString());

  return jsonResponse(
    {
      id: rally.id,
      title: rally.title,
      rallyTime: rally.rallyTime.toISOString(),
      status: rally.status,
      isTestMode: rally.isTestMode,
      serverTime: getServerTime(),
    },
    201
  );
}
