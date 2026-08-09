import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { getSessionFromRequest, SessionUser } from "./session";
import { errorResponse } from "./api";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function requireAuth(
  request: NextRequest
): Promise<SessionUser | Response> {
  const session = await getSessionFromRequest(request);
  if (!session) return errorResponse("Unauthorized", 401);
  return session;
}

export async function requireAdmin(
  request: NextRequest
): Promise<SessionUser | Response> {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;
  if (session.role !== "ADMIN") return errorResponse("Forbidden", 403);
  return session;
}

export async function requireCallerOrAdmin(
  request: NextRequest
): Promise<SessionUser | Response> {
  return requireAuth(request);
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export function generateTempPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  return null;
}
