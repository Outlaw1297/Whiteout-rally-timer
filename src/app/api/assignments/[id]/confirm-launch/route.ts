import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse, isValidUuid } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

interface RouteParams {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  const { id } = params;
  if (!isValidUuid(id)) return errorResponse("Invalid assignment ID");

  const assignment = await prisma.rallyAssignment.findUnique({
    where: { id },
    include: { rallyEvent: true },
  });

  if (!assignment) return errorResponse("Assignment not found", 404);
  if (assignment.userId !== session.id && session.role !== "ADMIN") {
    return errorResponse("Forbidden", 403);
  }

  await prisma.rallyAssignment.update({
    where: { id },
    data: { status: "LAUNCHED", launchedConfirmedAt: new Date() },
  });

  return jsonResponse({
    success: true,
    launchedConfirmedAt: new Date().toISOString(),
    launchTime: assignment.launchTime.toISOString(),
    expectedArrivalTime: assignment.expectedArrivalTime.toISOString(),
  });
}
