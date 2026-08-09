import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { startOrRestartRally } from "@/lib/start-rally";

interface RouteParams {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid event ID");

  const result = await startOrRestartRally(id);
  if ("error" in result && result.error) {
    return errorResponse(result.error, result.status);
  }

  return jsonResponse({ event: result.event });
}
