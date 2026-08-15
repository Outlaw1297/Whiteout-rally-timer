import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { normalizeDeviceId } from "@/lib/device-id";
import { writeActivityLog } from "@/lib/write-activity-log";

export const dynamic = "force-dynamic";

/**
 * Lightweight online heartbeat from the open app (tied to silent live pings).
 * Optionally stamps a specific device when endpoint is provided.
 */
export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  let body: {
    endpoint?: string;
    deviceId?: string;
    localSubscriptionState?: "present" | "missing" | "unknown";
  } = {};
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
  let retired = 0;

  // A successful browser-side getSubscription() returning null is authoritative.
  // Retire the old endpoint instead of making it look healthy by deviceId.
  if (body.localSubscriptionState === "missing" && deviceId) {
    const result = await prisma.pushSubscription.updateMany({
      where: { userId: session.id, deviceId, active: true },
      data: { active: false },
    });
    retired = result.count;
    if (retired > 0) {
      await writeActivityLog({
        kind: "DEVICE_RETIRE",
        success: true,
        userId: session.id,
        username: session.username,
        displayName: session.displayName,
        deviceId,
        message: `Retired ${retired} endpoint${retired === 1 ? "" : "s"} because this device no longer has a local push subscription`,
        meta: { reason: "local_subscription_missing", retired },
      });
    }
  } else if (body.localSubscriptionState === "present" && body.endpoint) {
    const updated = await prisma.pushSubscription.updateMany({
      where: {
        userId: session.id,
        active: true,
        endpoint: body.endpoint,
      },
      data: { lastSeenAt: now, ...(deviceId ? { deviceId } : {}) },
    });
    if (updated.count > 0) {
      const sub = await prisma.pushSubscription.findFirst({
        where: {
          userId: session.id,
          endpoint: body.endpoint,
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
    retired,
    needsRepair: body.localSubscriptionState === "missing",
  });
}
