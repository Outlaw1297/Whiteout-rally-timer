import { prisma } from "@/lib/prisma";
import { selectCanonicalSubscriptions } from "@/lib/device-id";
import { logger } from "@/lib/logger";

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
