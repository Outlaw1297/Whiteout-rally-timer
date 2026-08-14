import { NextRequest } from "next/server";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { resetManyRallies } from "@/lib/rally-batch";

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  let body: { eventIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  const eventIds = Array.isArray(body.eventIds) ? body.eventIds : [];
  if (eventIds.length === 0) {
    return errorResponse("Select at least one rally");
  }
  if (eventIds.some((id) => typeof id !== "string" || !isValidUuid(id))) {
    return errorResponse("Invalid event ID in list");
  }

  const result = await resetManyRallies(eventIds);

  if (result.status !== 200) {
    return errorResponse(result.error || "Could not reset rallies", result.status);
  }

  return jsonResponse({
    reset: result.reset,
    results: result.results,
  });
}
