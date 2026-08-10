import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse } from "@/lib/api";
import { requireDeveloper } from "@/lib/auth";
import { getVapidDiagnostics, initWebPush } from "@/lib/push";

export async function GET(request: NextRequest) {
  const session = await requireDeveloper(request);
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
      lastCalibratedAt: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          lastLoginAt: true,
          lastCalibratedAt: true,
          deliveryLeadMs: true,
          deliverySampleCount: true,
          assignments: {
            select: {
              notificationEvents: {
                select: { status: true },
              },
            },
          },
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
      deliveryLeadMs: true,
      deliverySampleCount: true,
      lastCalibratedAt: true,
      lastLoginAt: true,
      _count: { select: { pushSubscriptions: { where: { active: true } } } },
      assignments: {
        select: {
          notificationEvents: {
            select: { status: true },
          },
        },
      },
    },
  });

  function tally(assignments: Array<{ notificationEvents: Array<{ status: string }> }>) {
    let successfulNotifications = 0;
    let failedNotifications = 0;
    let missedNotifications = 0;
    for (const a of assignments) {
      for (const n of a.notificationEvents) {
        if (n.status === "SENT") successfulNotifications++;
        else if (n.status === "FAILED") failedNotifications++;
        else if (n.status === "SKIPPED" || n.status === "CANCELLED") missedNotifications++;
      }
    }
    return { successfulNotifications, failedNotifications, missedNotifications };
  }

  return jsonResponse({
    pushEnabled: diagnostics.configured,
    vapidSource: diagnostics.source,
    autoManaged: diagnostics.autoManaged,
    devices: subscriptions.map((sub) => {
      const stats = tally(sub.user.assignments);
      return {
        id: sub.id,
        platform: sub.platform || "unknown",
        userAgent: sub.userAgent,
        deliveryLeadMs: sub.deliveryLeadMs,
        deliverySampleCount: sub.deliverySampleCount,
        lastCalibratedAt: sub.lastCalibratedAt?.toISOString() ?? null,
        updatedAt: sub.updatedAt.toISOString(),
        user: {
          id: sub.user.id,
          username: sub.user.username,
          displayName: sub.user.displayName,
          role: sub.user.role,
          lastLoginAt: sub.user.lastLoginAt?.toISOString() ?? null,
          ...stats,
        },
      };
    }),
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      active: u.active,
      deviceCount: u._count.pushSubscriptions,
      deliveryLeadMs: u.deliveryLeadMs,
      deliverySampleCount: u.deliverySampleCount,
      lastCalibratedAt: u.lastCalibratedAt?.toISOString() ?? null,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      ...tally(u.assignments),
    })),
    summary: {
      totalDevices: subscriptions.length,
      android: subscriptions.filter((s) => s.platform === "Android").length,
      ios: subscriptions.filter((s) => s.platform === "iOS").length,
      desktop: subscriptions.filter((s) => s.platform === "Desktop").length,
    },
  });
}
