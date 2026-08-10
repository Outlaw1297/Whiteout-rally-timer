import { prisma } from "@/lib/prisma";

/** Copy rolling learned lead from active devices onto the user row for admin debug. */
export async function syncUserDeliveryLead(userId: string) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId, active: true },
    select: {
      deliveryLeadMs: true,
      deliverySampleCount: true,
      lastCalibratedAt: true,
    },
  });

  if (subscriptions.length === 0) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        deliveryLeadMs: null,
        deliverySampleCount: 0,
        lastCalibratedAt: null,
      },
    });
    return { deliveryLeadMs: null, deliverySampleCount: 0, lastCalibratedAt: null };
  }

  // Weighted-ish average: prefer the max lead (worst device) for scheduling safety,
  // but sample count is the sum so the UI shows total learning volume.
  const deliveryLeadMs = Math.round(
    subscriptions.reduce((sum, s) => sum + s.deliveryLeadMs, 0) / subscriptions.length
  );
  const deliverySampleCount = subscriptions.reduce((sum, s) => sum + s.deliverySampleCount, 0);
  const lastCalibratedAt = subscriptions.reduce<Date | null>((latest, s) => {
    if (!s.lastCalibratedAt) return latest;
    if (!latest || s.lastCalibratedAt > latest) return s.lastCalibratedAt;
    return latest;
  }, null);

  await prisma.user.update({
    where: { id: userId },
    data: { deliveryLeadMs, deliverySampleCount, lastCalibratedAt },
  });

  return { deliveryLeadMs, deliverySampleCount, lastCalibratedAt };
}
