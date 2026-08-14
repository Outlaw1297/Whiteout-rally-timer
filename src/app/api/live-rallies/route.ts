import { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/api";
import { listActivePublicEvents } from "@/lib/live-events";

/** Unambiguous public live list — not nested under /api/events/[id]. */
export async function GET(_request: NextRequest) {
  const events = await listActivePublicEvents();
  return jsonResponse({ events });
}
