import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { getSessionFromRequest } from "@/lib/session";
import { nextDeliveryLeadMs } from "@/lib/delivery-lead";
import { syncUserDeliveryLead } from "@/lib/sync-user-delivery-lead";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return errorResponse("Unauthorized", 401);

  let body: {
    targetAt: string;
    receivedAtMs: number;
    assignmentId?: string;
    notificationType?: string;
    rallyId?: string;
    endpoint?: string;
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  const targetMs = Date.parse(body.targetAt);
  const receivedAtMs = Number(body.receivedAtMs);
  if (!Number.isFinite(targetMs) || !Number.isFinite(receivedAtMs)) {
    return errorResponse("targetAt and receivedAtMs required");
  }

  if (body.assignmentId) {
    const assignment = await prisma.rallyAssignment.findUnique({
      where: { id: body.assignmentId },
      select: { userId: true },
    });
    if (!assignment || assignment.userId !== session.id) {
      return errorResponse("Forbidden", 403);
    }
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      userId: session.id,
      active: true,
      ...(body.endpoint ? { endpoint: body.endpoint } : {}),
    },
  });

  if (subscriptions.length === 0) {
    return errorResponse("No active push subscription", 404);
  }

  const delayMs = receivedAtMs - targetMs;
  const updates = [];

  const calibratedAt = new Date();
  for (const sub of subscriptions) {
    const next = nextDeliveryLeadMs(sub.deliveryLeadMs, delayMs, sub.deliverySampleCount);
    await prisma.pushSubscription.update({
      where: { id: sub.id },
      data: { ...next, lastCalibratedAt: calibratedAt, lastSeenAt: calibratedAt },
    });
    updates.push({
      subscriptionId: sub.id,
      platform: sub.platform,
      delayMs,
      ...next,
      lastCalibratedAt: calibratedAt.toISOString(),
    });
  }

  await prisma.user.update({
    where: { id: session.id },
    data: { lastSeenAt: calibratedAt },
  });

  const userLead = await syncUserDeliveryLead(session.id);

  logger.info("delivery_feedback", {
    userId: session.id,
    delayMs,
    notificationType: body.notificationType,
    assignmentId: body.assignmentId,
    updates,
  });

  return jsonResponse({
    ok: true,
    delayMs,
    devices: updates,
    userLead,
  });
}
