import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAdmin, hashPassword, generateTempPassword, validatePassword } from "@/lib/auth";
import { isDeveloperRole, type AppRole } from "@/lib/roles";

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const users = await prisma.user.findMany({
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      active: true,
      deliveryLeadMs: true,
      deliverySampleCount: true,
      lastCalibratedAt: true,
      lastLoginAt: true,
      createdAt: true,
      _count: { select: { pushSubscriptions: { where: { active: true } } } },
    },
  });

  return jsonResponse({
    users: users.map((u) => ({
      ...u,
      activeDevices: u._count.pushSubscriptions,
      createdAt: u.createdAt.toISOString(),
      lastCalibratedAt: u.lastCalibratedAt?.toISOString() ?? null,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  let body: {
    username?: string;
    displayName?: string;
    role?: AppRole;
    password?: string;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  if (!body.username || !body.displayName) {
    return errorResponse("username and displayName required");
  }

  const requestedRole: AppRole =
    body.role === "DEVELOPER" ? "DEVELOPER" : body.role === "ADMIN" ? "ADMIN" : "CALLER";

  if (requestedRole === "DEVELOPER") {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.id },
      select: { role: true, active: true },
    });
    const ok =
      isDeveloperRole(session.role) ||
      (!!dbUser?.active && isDeveloperRole(dbUser.role));
    if (!ok) {
      return errorResponse("Only developers can create developer accounts", 403);
    }
  }

  const username = body.username.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return errorResponse("Username already exists");

  const tempPassword = body.password || generateTempPassword();
  if (body.password) {
    const passwordError = validatePassword(body.password);
    if (passwordError) return errorResponse(passwordError);
  }

  const user = await prisma.user.create({
    data: {
      username,
      displayName: body.displayName.trim(),
      passwordHash: await hashPassword(tempPassword),
      role: requestedRole,
    },
  });

  return jsonResponse(
    {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
      temporaryPassword: body.password ? undefined : tempPassword,
      message: "Account created successfully",
    },
    201
  );
}
