import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

/**
 * Confirm this browser's push endpoint is still registered for the signed-in user.
 * Used after deploys / SW updates when the OS subscription may have drifted from DB.
 */
export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  let body: { endpoint?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  const endpoint = body.endpoint?.trim();
  if (!endpoint) return errorResponse("endpoint required");

  const subscription = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: {
      id: true,
      userId: true,
      active: true,
      platform: true,
      deliveryLeadMs: true,
      deliverySampleCount: true,
    },
  });

  if (!subscription) {
    return jsonResponse({
      registered: false,
      active: false,
      reason: "not_found",
    });
  }

  if (subscription.userId !== session.id) {
    // This browser's one push channel is currently owned by a different
    // account on this device — don't report "not registered", or callers
    // will silently re-subscribe and steal it back on every page load.
    return jsonResponse({
      registered: false,
      active: false,
      reason: subscription.active ? "owned_by_other" : "not_found",
    });
  }

  if (!subscription.active) {
    return jsonResponse({
      registered: true,
      active: false,
      reason: "inactive",
      subscriptionId: subscription.id,
    });
  }

  return jsonResponse({
    registered: true,
    active: true,
    subscriptionId: subscription.id,
    platform: subscription.platform,
    deliveryLeadMs: subscription.deliveryLeadMs,
    deliverySampleCount: subscription.deliverySampleCount,
  });
}
