import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { isDeveloperRole } from "@/lib/roles";
import { getVapidDiagnostics, initWebPush } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * Prefer DB role over JWT so a just-promoted developer can load diagnostics
 * even if their cookie has not refreshed yet.
 */
async function requireDeveloperFresh(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  const dbUser = await prisma.user.findUnique({
    where: { id: session.id },
    select: { role: true, active: true },
  });
  if (!dbUser?.active || !isDeveloperRole(dbUser.role)) {
    return errorResponse("Forbidden", 403);
  }
  return { ...session, role: dbUser.role as "DEVELOPER" };
}

export async function GET(request: NextRequest) {
  const session = await requireDeveloperFresh(request);
  if (session instanceof Response) return session;

  await initWebPush();
  const diagnostics = await getVapidDiagnostics();

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
      pushSubscriptions: {
        where: { active: true },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          platform: true,
          userAgent: true,
          deliveryLeadMs: true,
          deliverySampleCount: true,
          lastCalibratedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
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

  const nestedUsers = users.map((u) => {
    const stats = tally(u.assignments);
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      active: u.active,
      deviceCount: u.pushSubscriptions.length,
      deliveryLeadMs: u.deliveryLeadMs,
      deliverySampleCount: u.deliverySampleCount,
      lastCalibratedAt: u.lastCalibratedAt?.toISOString() ?? null,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      ...stats,
      devices: u.pushSubscriptions.map((sub) => ({
        id: sub.id,
        platform: sub.platform || "unknown",
        userAgent: sub.userAgent,
        deliveryLeadMs: sub.deliveryLeadMs,
        deliverySampleCount: sub.deliverySampleCount,
        lastCalibratedAt: sub.lastCalibratedAt?.toISOString() ?? null,
        createdAt: sub.createdAt.toISOString(),
        updatedAt: sub.updatedAt.toISOString(),
      })),
    };
  });

  const allDevices = nestedUsers.flatMap((u) => u.devices);

  return jsonResponse({
    pushEnabled: diagnostics.configured,
    vapidSource: diagnostics.source,
    autoManaged: diagnostics.autoManaged,
    users: nestedUsers,
    /** @deprecated Prefer users[].devices — kept for older clients */
    devices: allDevices.map((d) => ({
      ...d,
      user: nestedUsers.find((u) => u.devices.some((x) => x.id === d.id))!,
    })),
    summary: {
      totalUsers: nestedUsers.length,
      totalDevices: allDevices.length,
      android: allDevices.filter((s) => s.platform === "Android").length,
      ios: allDevices.filter((s) => s.platform === "iOS").length,
      desktop: allDevices.filter((s) => s.platform === "Desktop").length,
    },
  });
}
