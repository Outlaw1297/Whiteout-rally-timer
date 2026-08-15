import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { isDeveloperRole } from "@/lib/roles";
import { sendPushNotification, isExpiredSubscription } from "@/lib/push";
import { selectCanonicalSubscriptions, shortDeviceId } from "@/lib/device-id";
import {
  pushEndpointHost,
  summarizePushTestResults,
  type ActivityLogInput,
  type PushTestDeviceResult,
} from "@/lib/activity-log";
import { writeActivityLogs } from "@/lib/write-activity-log";

export const dynamic = "force-dynamic";

async function requireDeveloperFresh(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  const dbUser = await prisma.user.findUnique({
    where: { id: session.id },
    select: { role: true, active: true },
  });
  if (!dbUser?.active || !isDeveloperRole(dbUser.role)) {
    return errorResponse("Forbidden — developer only", 403);
  }
  return session;
}

export async function POST(request: NextRequest) {
  const session = await requireDeveloperFresh(request);
  if (session instanceof Response) return session;

  let body: { subscriptionId?: string; userId?: string; all?: boolean };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  let where: { active: true; id?: string; userId?: string } | null = null;
  if (body.all) {
    where = { active: true };
  } else if (body.subscriptionId && isValidUuid(body.subscriptionId)) {
    where = { id: body.subscriptionId, active: true };
  } else if (body.userId && isValidUuid(body.userId)) {
    where = { userId: body.userId, active: true };
  }

  if (!where) {
    return errorResponse("subscriptionId, userId, or all:true required");
  }

  const loaded = await prisma.pushSubscription.findMany({
    where,
    include: {
      user: { select: { displayName: true, username: true } },
    },
  });
  const subscriptions = body.subscriptionId
    ? loaded
    : selectCanonicalSubscriptions(loaded);

  if (subscriptions.length === 0) {
    await writeActivityLogs([
      {
        kind: "PUSH_TEST",
        success: false,
        userId: session.id,
        username: session.username,
        displayName: session.displayName,
        message: "Developer test — no active devices found",
        error: "No active devices found",
        meta: {
          source: "developer-test",
          target: body.all ? "all" : body.userId ? "user" : "subscription",
        },
      },
    ]);
    return errorResponse("No active devices found", 404);
  }

  const results: PushTestDeviceResult[] = [];
  const logs: ActivityLogInput[] = [];

  const targetAt = new Date().toISOString();

  // Fan out in parallel — important when testing many devices at once.
  await Promise.all(
    subscriptions.map(async (sub) => {
      const started = Date.now();
      const result = await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        {
          title: "Developer Test",
          body: `${sub.user.displayName} — ${sub.platform || "device"} notification check`,
          rallyId: "developer-test",
          notificationType: "TEST",
          targetAt,
        },
        {
          source: "developer-test",
          userId: sub.userId,
          username: sub.user.username,
          displayName: sub.user.displayName,
          subscriptionId: sub.id,
          deviceId: sub.deviceId,
          platform: sub.platform,
        }
      );
      const latencyMs = Date.now() - started;
      const deactivated =
        !result.success &&
        (isExpiredSubscription(result.statusCode) || result.statusCode === 401);

      if (deactivated) {
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { active: false },
        });
      }

      const row: PushTestDeviceResult = {
        subscriptionId: sub.id,
        deviceId: sub.deviceId,
        deviceLabel: shortDeviceId(sub.deviceId),
        platform: sub.platform,
        user: sub.user.displayName,
        username: sub.user.username,
        success: result.success,
        error: result.error,
        statusCode: result.statusCode,
        deactivated,
        latencyMs,
        endpointHost: pushEndpointHost(sub.endpoint) ?? undefined,
      };
      results.push(row);

      logs.push({
        kind: "PUSH_TEST",
        success: result.success,
        userId: sub.userId,
        username: sub.user.username,
        displayName: sub.user.displayName,
        deviceId: sub.deviceId,
        subscriptionId: sub.id,
        platform: sub.platform,
        message: result.success
          ? `Developer test accepted · ${sub.user.displayName} · ${sub.platform || "device"} (${latencyMs}ms)`
          : `Developer test failed · ${sub.user.displayName} · ${sub.platform || "device"}`,
        error: result.error,
        meta: {
          source: "developer-test",
          triggeredBy: session.username,
          statusCode: row.statusCode ?? null,
          dispatchId: result.dispatchId ?? null,
          providerMessageId: result.providerMessageId ?? null,
          latencyMs,
          endpointHost: row.endpointHost ?? null,
          deactivated,
        },
      });
    })
  );

  await writeActivityLogs(logs);

  const summary = summarizePushTestResults(results);

  return jsonResponse({
    success: summary.devicesNotified > 0,
    devicesTested: summary.devicesTested,
    devicesNotified: summary.devicesNotified,
    headline: summary.headline,
    detail: summary.detail,
    sentAt: targetAt,
    results,
  });
}
