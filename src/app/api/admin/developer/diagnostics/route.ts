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

/** Classify a stored notification row for developer stats. */
function classifyNotification(status: string, error: string | null | undefined): {
  successfulNotifications: number;
  failedNotifications: number;
  missedNotifications: number;
  pendingNotifications: number;
} {
  const empty = {
    successfulNotifications: 0,
    failedNotifications: 0,
    missedNotifications: 0,
    pendingNotifications: 0,
  };

  // Legacy bug: marked SENT when nothing was delivered.
  if (status === "SENT" && (error === "no devices" || error === "no linked account")) {
    return { ...empty, missedNotifications: 1 };
  }
  if (status === "SENT") return { ...empty, successfulNotifications: 1 };
  if (status === "FAILED") return { ...empty, failedNotifications: 1 };
  if (status === "SKIPPED" || status === "CANCELLED") {
    return { ...empty, missedNotifications: 1 };
  }
  if (status === "PENDING") return { ...empty, pendingNotifications: 1 };
  return empty;
}

function sumStats(
  items: Array<{
    successfulNotifications: number;
    failedNotifications: number;
    missedNotifications: number;
    pendingNotifications: number;
  }>
) {
  return items.reduce(
    (acc, cur) => ({
      successfulNotifications: acc.successfulNotifications + cur.successfulNotifications,
      failedNotifications: acc.failedNotifications + cur.failedNotifications,
      missedNotifications: acc.missedNotifications + cur.missedNotifications,
      pendingNotifications: acc.pendingNotifications + cur.pendingNotifications,
    }),
    {
      successfulNotifications: 0,
      failedNotifications: 0,
      missedNotifications: 0,
      pendingNotifications: 0,
    }
  );
}

export async function GET(request: NextRequest) {
  const session = await requireDeveloperFresh(request);
  if (session instanceof Response) return session;

  await initWebPush();
  const diagnostics = await getVapidDiagnostics();

  // Repair legacy false-SENT rows so DB matches what we display.
  await prisma.notificationEvent.updateMany({
    where: {
      status: "SENT",
      OR: [{ error: "no devices" }, { error: "no linked account" }],
    },
    data: { status: "SKIPPED" },
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
            select: { status: true, error: true },
          },
        },
      },
    },
  });

  function tally(
    assignments: Array<{ notificationEvents: Array<{ status: string; error: string | null }> }>
  ) {
    return sumStats(
      assignments.flatMap((a) =>
        a.notificationEvents.map((n) => classifyNotification(n.status, n.error))
      )
    );
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

  const allEvents = await prisma.notificationEvent.findMany({
    select: { status: true, error: true },
  });
  const notificationSummary = sumStats(
    allEvents.map((n) => classifyNotification(n.status, n.error))
  );

  const unlinkedSkipped = await prisma.notificationEvent.count({
    where: {
      status: "SKIPPED",
      assignment: { userId: null },
    },
  });

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
      notifications: notificationSummary,
      unlinkedSkipped,
    },
  });
}
