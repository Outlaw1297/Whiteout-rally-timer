import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { verifyPassword } from "@/lib/auth";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { rateLimit, RATE_LIMITS, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(`login:${ip}`, { windowMs: 60_000, maxRequests: 20 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  const { username, password } = body;
  if (!username || !password) return errorResponse("Username and password required");

  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase().trim() },
  });

  if (!user || !user.active) return errorResponse("Invalid credentials", 401);

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return errorResponse("Invalid credentials", 401);

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
  });
  setSessionCookie(response, token);
  return response;
}
