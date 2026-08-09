import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid rally ID", 400);

  const endpoint = request.nextUrl.searchParams.get("endpoint");
  if (!endpoint) return errorResponse("endpoint query parameter required");

  const subscription = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    include: {
      rallySubscriptions: {
        where: { rallyId: id },
      },
    },
  });

  if (!subscription) {
    return jsonResponse({ subscribed: false, active: false });
  }

  return jsonResponse({
    subscribed: subscription.rallySubscriptions.length > 0,
    active: subscription.active,
    subscriptionId: subscription.id,
  });
}
