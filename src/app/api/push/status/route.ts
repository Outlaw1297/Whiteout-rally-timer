import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getVapidPublicKey, getVapidDiagnostics, initWebPush } from "@/lib/push";
import { resolveDevicePlatform } from "@/lib/device-platform";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: session.id, active: true },
    select: {
      id: true,
      platform: true,
      deliveryLeadMs: true,
      deliverySampleCount: true,
      userAgent: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  await initWebPush();
  const diagnostics = await getVapidDiagnostics();

  return jsonResponse({
    vapidConfigured: diagnostics.configured,
    vapidError: diagnostics.error,
    vapidSource: diagnostics.source,
    autoManaged: diagnostics.autoManaged,
    hasPublicKey: diagnostics.hasPublicKey,
    hasPrivateKey: diagnostics.hasPrivateKey,
    publicKey: await getVapidPublicKey(),
    devices: subscriptions.map((sub) => ({
      id: sub.id,
      platform: resolveDevicePlatform(sub.platform, sub.userAgent),
      deliveryLeadMs: sub.deliveryLeadMs,
      deliverySampleCount: sub.deliverySampleCount,
      userAgent: sub.userAgent,
      updatedAt: sub.updatedAt.toISOString(),
    })),
    deviceCount: subscriptions.length,
  });
}
