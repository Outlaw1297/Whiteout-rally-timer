import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import {
  ALLOWED_WARNING_LEADS,
  normalizeWarningLeads,
  parseUserWarningLeads,
} from "@/lib/notification-prefs";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      warningLeadsSeconds: true,
      warn10Enabled: true,
      warn5Enabled: true,
      launchEnabled: true,
    },
  });

  if (!user) return errorResponse("User not found", 404);

  const warningLeadsSeconds = parseUserWarningLeads(user);

  return jsonResponse({
    warningLeadsSeconds,
    allowedWarningLeads: ALLOWED_WARNING_LEADS,
    required: ["RALLY_STARTED", "LAUNCH"],
    // Always true — kept for older clients
    launchEnabled: true,
    rallyStartedEnabled: true,
  });
}

export async function PATCH(request: NextRequest) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  let body: {
    warningLeadsSeconds?: unknown;
    warn10Enabled?: boolean;
    warn5Enabled?: boolean;
    launchEnabled?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  let warningLeadsSeconds = normalizeWarningLeads(body.warningLeadsSeconds);

  // Legacy checkbox clients: map booleans into the leads array.
  if (body.warningLeadsSeconds === undefined) {
    if (typeof body.warn10Enabled === "boolean" || typeof body.warn5Enabled === "boolean") {
      const leads: number[] = [];
      if (body.warn10Enabled !== false) leads.push(10);
      if (body.warn5Enabled !== false) leads.push(5);
      warningLeadsSeconds = normalizeWarningLeads(leads);
    }
  }

  const user = await prisma.user.update({
    where: { id: session.id },
    data: {
      warningLeadsSeconds,
      // Keep legacy flags in sync for older code paths
      warn10Enabled: warningLeadsSeconds.includes(10),
      warn5Enabled: warningLeadsSeconds.includes(5),
      launchEnabled: true,
    },
    select: {
      warningLeadsSeconds: true,
      warn10Enabled: true,
      warn5Enabled: true,
      launchEnabled: true,
    },
  });

  return jsonResponse({
    warningLeadsSeconds: parseUserWarningLeads(user),
    allowedWarningLeads: ALLOWED_WARNING_LEADS,
    required: ["RALLY_STARTED", "LAUNCH"],
    launchEnabled: true,
    rallyStartedEnabled: true,
  });
}
