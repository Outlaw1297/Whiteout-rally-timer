import { NextRequest } from "next/server";
import { jsonResponse, NO_STORE_HEADERS } from "@/lib/api";
import { listActivePublicEvents } from "@/lib/live-events";

/** Unambiguous public live list — not nested under /api/events/[id]. */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(_request: NextRequest) {
  const events = await listActivePublicEvents();
  return jsonResponse({ events }, 200, NO_STORE_HEADERS);
}
