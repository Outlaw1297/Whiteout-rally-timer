import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth, verifyPassword, hashPassword, validatePassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  if (!body.currentPassword || !body.newPassword) {
    return errorResponse("Current and new password required");
  }
  const passwordError = validatePassword(body.newPassword);
  if (passwordError) return errorResponse(passwordError);

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return errorResponse("User not found", 404);

  const valid = await verifyPassword(body.currentPassword, user.passwordHash);
  if (!valid) return errorResponse("Current password is incorrect", 401);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(body.newPassword) },
  });

  return jsonResponse({ success: true });
}
