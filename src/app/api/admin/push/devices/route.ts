import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getVapidDiagnostics, initWebPush } from "@/lib/push";

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

  return jsonResponse({
    pushEnabled: diagnostics.configured,
    vapidSource: diagnostics.source,
    autoManaged: diagnostics.autoManaged,
    devices: subscriptions.map((sub) => ({
      id: sub.id,
      platform: sub.platform || "unknown",
      userAgent: sub.userAgent,
      updatedAt: sub.updatedAt.toISOString(),
      user: sub.user,
    })),
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      active: u.active,
      deviceCount: u._count.pushSubscriptions,
    })),
    summary: {
      totalDevices: subscriptions.length,
      android: subscriptions.filter((s) => s.platform === "Android").length,
      ios: subscriptions.filter((s) => s.platform === "iOS").length,
      desktop: subscriptions.filter((s) => s.platform === "Desktop").length,
      unknown: subscriptions.filter(
        (s) => !s.platform || !["Android", "iOS", "Desktop"].includes(s.platform)
      ).length,
    },
  });
}
