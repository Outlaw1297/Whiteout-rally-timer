import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse } from "@/lib/api";
import {
  getSessionFromRequest,
  createSessionToken,
  setSessionCookie,
  type SessionUser,
} from "@/lib/session";
import type { AppRole } from "@/lib/roles";

function isAppRole(role: string): role is AppRole {
  return role === "ADMIN" || role === "CALLER" || role === "DEVELOPER";
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonResponse({ user: null });

  // Refresh role from DB so promotions (e.g. ADMIN → DEVELOPER) show up
  // without forcing a manual logout.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      active: true,
    },
  });

  if (!dbUser || !dbUser.active || !isAppRole(dbUser.role)) {
    return jsonResponse({ user: null });
  }

  const user: SessionUser = {
    id: dbUser.id,
    username: dbUser.username,
    displayName: dbUser.displayName,
    role: dbUser.role,
  };

  const usedBearer = /^Bearer\s+/i.test(request.headers.get("authorization") || "");
  const response = NextResponse.json(
    usedBearer
      ? {
          user,
          token: await createSessionToken(user),
        }
      : { user }
  );

  if (
    !usedBearer &&
    (user.role !== session.role ||
      user.displayName !== session.displayName ||
      user.username !== session.username)
  ) {
    const token = await createSessionToken(user);
    setSessionCookie(response, token);
  }

  return response;
}
