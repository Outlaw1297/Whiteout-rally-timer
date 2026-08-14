import { prisma } from "@/lib/prisma";
import { selectCanonicalSubscriptions } from "@/lib/device-id";
import { logger } from "@/lib/logger";
import { buildUnbindWhere } from "@/lib/unbind-device";
import { pushEndpointHost } from "@/lib/activity-log";
import { writeActivityLog } from "@/lib/write-activity-log";

export async function listCanonicalPushSubscriptions(userId: string) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId, active: true },
  });
  return selectCanonicalSubscriptions(subscriptions);
}

export async function retireDuplicatePushSubscriptions(opts: {
  userId: string;
  keepId: string;
  deviceId?: string | null;
  userAgent?: string | null;
}): Promise<number> {
  const or: Array<{ deviceId: string } | { userAgent: string; deviceId: null }> = [];
  if (opts.deviceId) or.push({ deviceId: opts.deviceId });
  // Legacy rows from the same phone before deviceId existed.
  if (opts.userAgent) or.push({ userAgent: opts.userAgent, deviceId: null });
  if (or.length === 0) return 0;

  const result = await prisma.pushSubscription.updateMany({
    where: {
      userId: opts.userId,
      active: true,
      id: { not: opts.keepId },
      OR: or,
    },
    data: { active: false },
  });

  if (result.count > 0) {
    logger.info("push_duplicates_retired", {
      userId: opts.userId,
      keepId: opts.keepId,
      deviceId: opts.deviceId,
      retired: result.count,
    });
  }

  return result.count;
}

/**
 * Stop alerts on THIS install after logout. Other phones on the same account stay subscribed.
 * Does not delete deviceId — the next login re-attaches the same phone.
 */
export async function unbindCurrentDevice(opts: {
  userId: string;
  username?: string | null;
  displayName?: string | null;
  endpoint?: string | null;
  deviceId?: string | null;
}): Promise<{ unbound: number }> {
  const where = buildUnbindWhere(opts);
  if (!where) return { unbound: 0 };

  const result = await prisma.pushSubscription.updateMany({
    where,
    data: { active: false },
  });

  if (result.count > 0) {
    logger.info("push_device_unbound_on_logout", {
      userId: opts.userId,
      deviceId: opts.deviceId,
      unbound: result.count,
    });
    await writeActivityLog({
      kind: "DEVICE_UNBIND",
      success: true,
      userId: opts.userId,
      username: opts.username,
      displayName: opts.displayName,
      deviceId: opts.deviceId,
      message: `Unbound ${result.count} push endpoint${result.count === 1 ? "" : "s"} on this device`,
      meta: {
        unbound: result.count,
        endpointHost: pushEndpointHost(opts.endpoint),
      },
    });
  }

  return { unbound: result.count };
}
