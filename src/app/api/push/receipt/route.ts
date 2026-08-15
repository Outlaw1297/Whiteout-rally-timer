import { NextRequest } from "next/server";
import { errorResponse, jsonResponse } from "@/lib/api";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { recordPushReceipt, type PushReceiptStage } from "@/lib/push-delivery";
import { verifyPushReceiptToken } from "@/lib/push-receipt";

const STAGES = new Set<PushReceiptStage>([
  "received",
  "displayed",
  "display_failed",
  "clicked",
]);

export async function POST(request: NextRequest) {
  let body: {
    dispatchId?: string;
    receiptToken?: string;
    stage?: string;
    serviceWorkerVersion?: string;
    error?: string;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  const dispatchId = body.dispatchId?.trim();
  const stage = body.stage as PushReceiptStage;
  if (!dispatchId || !STAGES.has(stage)) return errorResponse("Invalid receipt");
  if (!verifyPushReceiptToken(dispatchId, body.receiptToken)) {
    return errorResponse("Invalid or expired receipt token", 403);
  }

  const limit = rateLimit(`push-receipt:${dispatchId}`, {
    windowMs: 60_000,
    maxRequests: 12,
  });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const result = await recordPushReceipt({
    dispatchId,
    stage,
    serviceWorkerVersion: body.serviceWorkerVersion,
    error: body.error,
  });
  if (result.count === 0) return errorResponse("Delivery attempt not found", 404);
  return jsonResponse({ ok: true });
}
