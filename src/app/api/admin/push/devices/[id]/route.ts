import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { writeActivityLog } from "@/lib/write-activity-log";

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
    select: {
      id: true,
      userId: true,
      platform: true,
      deviceId: true,
      user: { select: { username: true, displayName: true } },
    },
  });
  if (!sub) return errorResponse("Device not found", 404);

  await prisma.pushSubscription.delete({ where: { id } });

  await writeActivityLog({
    kind: "DEVICE_UNBIND",
    success: true,
    userId: sub.userId,
    username: sub.user.username,
    displayName: sub.user.displayName,
    deviceId: sub.deviceId,
    subscriptionId: sub.id,
    platform: sub.platform,
    message: `${session.displayName} removed ${sub.platform || "device"} for ${sub.user.displayName}`,
    meta: { reason: "admin-delete", deletedBy: session.username },
  });

  return jsonResponse({
    ok: true,
    deletedId: id,
    userId: sub.userId,
    platform: sub.platform,
    message: "Device removed",
  });
}
