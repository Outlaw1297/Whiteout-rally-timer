import { NextRequest } from "next/server";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { startManyRallies } from "@/lib/rally-batch";

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  let body: { eventIds?: string[]; staggerSeconds?: number };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  const eventIds = Array.isArray(body.eventIds) ? body.eventIds : [];
  if (eventIds.length === 0) {
    return errorResponse("Select at least one template");
  }
  if (eventIds.some((id) => typeof id !== "string" || !isValidUuid(id))) {
    return errorResponse("Invalid event ID in list");
  }

  const result = await startManyRallies(eventIds, {
    staggerSeconds: body.staggerSeconds,
  });

  if (result.status !== 200) {
    return errorResponse(result.error || "Could not start rallies", result.status);
  }

  return jsonResponse({
    started: result.started,
    results: result.results,
  });
}
