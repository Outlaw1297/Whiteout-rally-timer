import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { verifyPassword } from "@/lib/auth";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { normalizeDeviceId } from "@/lib/device-id";
import { detectPlatformFromUA } from "@/lib/device-platform";
import { writeActivityLog } from "@/lib/write-activity-log";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(`login:${ip}`, { windowMs: 60_000, maxRequests: 20 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  let body: { username?: string; password?: string; deviceId?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  const { username, password } = body;
  const deviceId = normalizeDeviceId(body.deviceId);
  const userAgent = request.headers.get("user-agent");
  const platform = detectPlatformFromUA(userAgent);

  if (!username || !password) return errorResponse("Username and password required");

  const attempted = username.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { username: attempted },
  });

  if (!user || !user.active) {
    await writeActivityLog({
      kind: "LOGIN_FAILED",
      success: false,
      username: attempted,
      deviceId,
      platform,
      message: "Invalid credentials",
      error: "Invalid credentials",
      meta: { platform },
    });
    return errorResponse("Invalid credentials", 401);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await writeActivityLog({
      kind: "LOGIN_FAILED",
      success: false,
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      deviceId,
      platform,
      message: "Invalid credentials",
      error: "Invalid credentials",
      meta: { platform },
    });
    return errorResponse("Invalid credentials", 401);
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: now, lastSeenAt: now },
  });

  await writeActivityLog({
    kind: "LOGIN",
    success: true,
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    deviceId,
    platform,
    message: `${user.displayName} signed in${deviceId ? ` · device ${deviceId.slice(0, 8)}` : ""}`,
    meta: { platform, userAgent: userAgent?.slice(0, 180) ?? null },
  });

  const token = await createSessionToken({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  });

  const response = jsonResponse({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
    /** JWT for native / Expo clients (web still uses the httpOnly cookie). */
    token,
  });
  setSessionCookie(response, token);
  return response;
}
