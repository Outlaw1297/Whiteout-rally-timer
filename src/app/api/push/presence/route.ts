import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { normalizeDeviceId } from "@/lib/device-id";

export const dynamic = "force-dynamic";

/**
 * Lightweight online heartbeat from the open app (tied to silent live pings).
 * Optionally stamps a specific device when endpoint is provided.
 */
export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  let body: { endpoint?: string; deviceId?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const now = new Date();

  await prisma.user.update({
    where: { id: session.id },
    data: { lastSeenAt: now },
  });

  let stampedId: string | null = null;
  const deviceId = normalizeDeviceId(body.deviceId);
  if (body.endpoint || deviceId) {
    const updated = await prisma.pushSubscription.updateMany({
      where: {
        userId: session.id,
        active: true,
        ...(body.endpoint ? { endpoint: body.endpoint } : { deviceId: deviceId! }),
      },
      data: { lastSeenAt: now, ...(deviceId ? { deviceId } : {}) },
    });
    if (updated.count > 0) {
      const sub = await prisma.pushSubscription.findFirst({
        where: {
          userId: session.id,
          ...(body.endpoint ? { endpoint: body.endpoint } : { deviceId: deviceId! }),
        },
        select: { id: true, deviceId: true },
      });
      stampedId = sub?.deviceId ?? sub?.id ?? null;
    }
  }

  return jsonResponse({
    ok: true,
    lastSeenAt: now.toISOString(),
    deviceId: stampedId,
  });
}
