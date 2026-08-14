import { prisma } from "@/lib/prisma";
import { selectCanonicalSubscriptions } from "@/lib/device-id";

/** Copy rolling learned lead from canonical devices onto the user row for admin debug. */
export async function syncUserDeliveryLead(userId: string) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId, active: true },
    select: {
      deliveryLeadMs: true,
      deliverySampleCount: true,
      lastCalibratedAt: true,
      deviceId: true,
      userAgent: true,
      updatedAt: true,
      lastSeenAt: true,
      id: true,
    },
  });
  const canonical = selectCanonicalSubscriptions(subscriptions);

  if (canonical.length === 0) {
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

  const deliveryLeadMs = Math.round(
    canonical.reduce((sum, s) => sum + s.deliveryLeadMs, 0) / canonical.length
  );
  const deliverySampleCount = canonical.reduce((sum, s) => sum + s.deliverySampleCount, 0);
  const lastCalibratedAt = canonical.reduce<Date | null>((latest, s) => {
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
