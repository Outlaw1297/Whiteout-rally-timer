import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { recordDeclarativePushOpen } from "@/lib/push-delivery";
import { verifyPushReceiptToken } from "@/lib/push-receipt";

export const dynamic = "force-dynamic";

function safeDestination(request: NextRequest): URL {
  const raw = request.nextUrl.searchParams.get("next") || "/caller";
  const path = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/caller";
  return new URL(path, request.nextUrl.origin);
}

export async function GET(request: NextRequest) {
  const destination = safeDestination(request);
  const dispatchId = request.nextUrl.searchParams.get("dispatchId")?.trim();
  const receiptToken = request.nextUrl.searchParams.get("receiptToken");

  if (
    dispatchId &&
    dispatchId.length <= 100 &&
    verifyPushReceiptToken(dispatchId, receiptToken)
  ) {
    const limit = rateLimit(`push-open:${dispatchId}`, {
      windowMs: 60_000,
      maxRequests: 6,
    });
    if (limit.allowed) {
      await recordDeclarativePushOpen(dispatchId).catch(() => {});
    }
  }

  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
