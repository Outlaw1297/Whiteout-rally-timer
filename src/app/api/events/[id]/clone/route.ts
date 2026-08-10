import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { serializeEvent } from "@/lib/rally-event";
import { cloneRallyTemplate } from "@/lib/rally-batch";

interface RouteParams {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid event ID");

  let body: { name?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const result = await cloneRallyTemplate(id, body.name);
  if ("error" in result) {
    return errorResponse(result.error!, result.status);
  }

  return jsonResponse(serializeEvent(result.event!), 201);
}
