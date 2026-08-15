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
    reportWorkerHealth?: boolean;
    workerHealth?: {
      supported?: boolean;
      controlled?: boolean;
      registrationState?: string;
      version?: string | null;
      responding?: boolean;
      scriptPath?: string | null;
    };
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
  let stampedSubscriptionId: string | null = null;
  let stampedPlatform: string | null = null;
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
        select: { id: true, deviceId: true, platform: true },
      });
      stampedId = sub?.deviceId ?? sub?.id ?? null;
      stampedSubscriptionId = sub?.id ?? null;
      stampedPlatform = sub?.platform ?? null;
    }
  }

  if (body.reportWorkerHealth && body.workerHealth) {
    const health = body.workerHealth;
    const version = typeof health.version === "string" ? health.version.slice(0, 100) : null;
    const registrationState =
      typeof health.registrationState === "string"
        ? health.registrationState.slice(0, 30)
        : "unknown";
    const scriptPath =
      typeof health.scriptPath === "string" ? health.scriptPath.slice(0, 255) : null;
    const controlled = health.controlled === true;
    const responding = health.responding === true;
    const status = controlled
      ? "controlling this PWA"
      : health.supported === false
        ? "not supported"
        : "registered but not controlling this page";

    await writeActivityLog({
      kind: "SW_HEALTH",
      success: controlled && responding,
      userId: session.id,
      username: session.username,
      displayName: session.displayName,
      deviceId,
      subscriptionId: stampedSubscriptionId,
      platform: stampedPlatform,
      message: `PWA opened: service worker ${version || registrationState} is ${status}`,
      error: responding ? null : "Worker did not answer the foreground version check",
      meta: {
        controlled,
        responding,
        supported: health.supported !== false,
        registrationState,
        version,
        scriptPath,
        localSubscriptionState: body.localSubscriptionState || "unknown",
      },
    });
  }

  return jsonResponse({
    ok: true,
    lastSeenAt: now.toISOString(),
    deviceId: stampedId,
    retired,
    needsRepair: body.localSubscriptionState === "missing",
  });
}
