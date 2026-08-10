import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin, hashPassword, generateTempPassword, validatePassword } from "@/lib/auth";
import { isDeveloperRole, type AppRole } from "@/lib/roles";

interface RouteParams {
  params: { id: string };
}

async function sessionIsDeveloper(sessionId: string, sessionRole: string): Promise<boolean> {
  if (isDeveloperRole(sessionRole)) return true;
  const dbUser = await prisma.user.findUnique({
    where: { id: sessionId },
    select: { role: true, active: true },
  });
  return !!dbUser?.active && isDeveloperRole(dbUser.role);
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid user ID");

  let body: {
    displayName?: string;
    active?: boolean;
    role?: AppRole;
    resetPassword?: boolean;
    password?: string;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return errorResponse("User not found", 404);

  if (body.role !== undefined && body.role !== user.role) {
    if (body.role === "DEVELOPER") {
      const ok = await sessionIsDeveloper(session.id, session.role);
      if (!ok) {
        return errorResponse("Only developers can grant the developer role", 403);
      }
    }
    if (
      id === session.id &&
      (body.role === "CALLER" || (user.role === "DEVELOPER" && body.role !== "DEVELOPER"))
    ) {
      return errorResponse("You cannot demote your own elevated account", 400);
    }
  }

  const updateData: Record<string, unknown> = {};
  if (body.displayName !== undefined) updateData.displayName = body.displayName.trim();
  if (body.active !== undefined) updateData.active = body.active;
  if (body.role !== undefined) updateData.role = body.role;

  let tempPassword: string | undefined;
  if (body.password !== undefined) {
    const passwordError = validatePassword(body.password);
    if (passwordError) return errorResponse(passwordError);
    updateData.passwordHash = await hashPassword(body.password);
  } else if (body.resetPassword) {
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
    message: body.password || body.resetPassword ? "Password updated successfully" : "User updated",
  });
}
