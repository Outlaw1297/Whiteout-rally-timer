import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      warn10Enabled: true,
      warn5Enabled: true,
      launchEnabled: true,
    },
  });

  if (!user) return errorResponse("User not found", 404);

  return jsonResponse(user);
}

export async function PATCH(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  let body: {
    warn10Enabled?: boolean;
    warn5Enabled?: boolean;
    launchEnabled?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  const updateData: Record<string, boolean> = {};
  if (typeof body.warn10Enabled === "boolean") updateData.warn10Enabled = body.warn10Enabled;
  if (typeof body.warn5Enabled === "boolean") updateData.warn5Enabled = body.warn5Enabled;
  if (typeof body.launchEnabled === "boolean") updateData.launchEnabled = body.launchEnabled;

  const user = await prisma.user.update({
    where: { id: session.id },
    data: updateData,
    select: {
      warn10Enabled: true,
      warn5Enabled: true,
      launchEnabled: true,
    },
  });

  return jsonResponse(user);
}
