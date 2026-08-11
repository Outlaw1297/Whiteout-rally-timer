import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Lightweight online heartbeat from the open app (tied to silent live pings).
 * Optionally stamps a specific device when endpoint is provided.
 */
export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  let body: { endpoint?: string } = {};
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

  let deviceId: string | null = null;
  if (body.endpoint) {
    const updated = await prisma.pushSubscription.updateMany({
      where: { userId: session.id, endpoint: body.endpoint, active: true },
      data: { lastSeenAt: now },
    });
    if (updated.count > 0) {
      const sub = await prisma.pushSubscription.findFirst({
        where: { userId: session.id, endpoint: body.endpoint },
        select: { id: true },
      });
      deviceId = sub?.id ?? null;
    }
  }

  return jsonResponse({
    ok: true,
    lastSeenAt: now.toISOString(),
    deviceId,
  });
}
