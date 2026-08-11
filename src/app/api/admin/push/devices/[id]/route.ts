import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

interface RouteParams {
  params: { id: string };
}

/** Permanently remove a push device (admin / developer). */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid device ID");

  const sub = await prisma.pushSubscription.findUnique({
    where: { id },
    select: { id: true, userId: true, platform: true },
  });
  if (!sub) return errorResponse("Device not found", 404);

  await prisma.pushSubscription.delete({ where: { id } });

  return jsonResponse({
    ok: true,
    deletedId: id,
    userId: sub.userId,
    platform: sub.platform,
    message: "Device removed",
  });
}
