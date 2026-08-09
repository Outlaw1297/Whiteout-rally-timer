import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { getServerTime } from "@/lib/time";
import { rateLimit, RATE_LIMITS, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { serializeRally } from "@/lib/rally";

export async function GET() {
  const rallies = await prisma.rally.findMany({
    where: {
      cancelled: false,
      status: { in: ["READY", "ACTIVE", "SCHEDULED"] },
    },
    orderBy: { createdAt: "desc" },
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
    createdBy?: string;
    isTestMode?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { title, createdBy, isTestMode } = body;

  if (!title || title.trim().length === 0) {
    return errorResponse("Title is required");
  }

  if (title.length > 100) {
    return errorResponse("Title must be 100 characters or less");
  }

  const rally = await prisma.rally.create({
    data: {
      title: title.trim(),
      createdBy: createdBy || null,
      isTestMode: !!isTestMode,
      status: "READY",
    },
  });

  logger.rallyCreated(rally.id, rally.title, "pending-start");

  return jsonResponse(serializeRally(rally), 201);
}
