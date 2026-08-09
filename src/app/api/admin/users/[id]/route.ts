import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin, hashPassword, generateTempPassword } from "@/lib/auth";

interface RouteParams {
  params: { id: string };
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid user ID");

  let body: {
    displayName?: string;
    active?: boolean;
    role?: "ADMIN" | "CALLER";
    resetPassword?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return errorResponse("User not found", 404);

  const updateData: Record<string, unknown> = {};
  if (body.displayName !== undefined) updateData.displayName = body.displayName.trim();
  if (body.active !== undefined) updateData.active = body.active;
  if (body.role !== undefined) updateData.role = body.role;

  let tempPassword: string | undefined;
  if (body.resetPassword) {
    tempPassword = generateTempPassword();
    updateData.passwordHash = await hashPassword(tempPassword);
  }

  const updated = await prisma.user.update({ where: { id }, data: updateData });

  return jsonResponse({
    user: {
      id: updated.id,
      username: updated.username,
      displayName: updated.displayName,
      role: updated.role,
      active: updated.active,
    },
    temporaryPassword: tempPassword,
  });
}
