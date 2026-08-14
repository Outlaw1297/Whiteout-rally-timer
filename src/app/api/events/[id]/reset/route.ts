import { NextRequest } from "next/server";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { resetRally } from "@/lib/rally-batch";

interface RouteParams {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid event ID");

  const result = await resetRally(id);
  if (result.error) {
    return errorResponse(result.error, result.status);
  }

  return jsonResponse({ event: result.event });
}
