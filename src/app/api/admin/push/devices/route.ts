import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getVapidDiagnostics, initWebPush } from "@/lib/push";
import { platformFamily, resolveDevicePlatform } from "@/lib/device-platform";

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  await initWebPush();
  const diagnostics = await getVapidDiagnostics();

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { active: true },
    select: {
      id: true,
      platform: true,
      userAgent: true,
      deliveryLeadMs: true,
      deliverySampleCount: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
        },
      },
    },
    orderBy: [{ user: { displayName: "asc" } }, { updatedAt: "desc" }],
  });

  const users = await prisma.user.findMany({
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      active: true,
      _count: { select: { pushSubscriptions: { where: { active: true } } } },
    },
  });

  const devices = subscriptions.map((sub) => {
    const platform = resolveDevicePlatform(sub.platform, sub.userAgent);
    return {
      id: sub.id,
      platform,
      platformFamily: platformFamily(platform),
      userAgent: sub.userAgent,
      deliveryLeadMs: sub.deliveryLeadMs,
      deliverySampleCount: sub.deliverySampleCount,
      updatedAt: sub.updatedAt.toISOString(),
      user: sub.user,
    };
  });

  return jsonResponse({
    pushEnabled: diagnostics.configured,
    vapidSource: diagnostics.source,
    autoManaged: diagnostics.autoManaged,
    devices,
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      active: u.active,
      deviceCount: u._count.pushSubscriptions,
    })),
    summary: {
      totalDevices: devices.length,
      android: devices.filter((s) => s.platformFamily === "Android").length,
      ios: devices.filter((s) => s.platformFamily === "iOS").length,
      desktop: devices.filter((s) => s.platformFamily === "Desktop").length,
      unknown: devices.filter((s) => s.platformFamily === "Unknown").length,
    },
  });
}
