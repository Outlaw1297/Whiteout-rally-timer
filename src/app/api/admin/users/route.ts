import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAdmin, hashPassword, generateTempPassword, validatePassword } from "@/lib/auth";

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
      createdAt: true,
      _count: { select: { pushSubscriptions: { where: { active: true } } } },
    },
  });

  return jsonResponse({
    users: users.map((u) => ({
      ...u,
      activeDevices: u._count.pushSubscriptions,
      createdAt: u.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  let body: {
    username?: string;
    displayName?: string;
    role?: "ADMIN" | "CALLER";
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
      role: body.role === "ADMIN" ? "ADMIN" : "CALLER",
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
    },
    201
  );
}
