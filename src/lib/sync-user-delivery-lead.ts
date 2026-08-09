import { prisma } from "@/lib/prisma";

/** Copy max learned lead from active devices onto the user row for admin debug. */
export async function syncUserDeliveryLead(userId: string) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId, active: true },
    select: { deliveryLeadMs: true, deliverySampleCount: true },
  });

  if (subscriptions.length === 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { deliveryLeadMs: null, deliverySampleCount: 0 },
    });
    return { deliveryLeadMs: null, deliverySampleCount: 0 };
  }

  const deliveryLeadMs = Math.max(...subscriptions.map((s) => s.deliveryLeadMs));
  const deliverySampleCount = Math.max(...subscriptions.map((s) => s.deliverySampleCount));

  await prisma.user.update({
    where: { id: userId },
    data: { deliveryLeadMs, deliverySampleCount },
  });

  return { deliveryLeadMs, deliverySampleCount };
}
