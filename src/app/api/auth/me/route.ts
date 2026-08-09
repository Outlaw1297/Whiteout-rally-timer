import { jsonResponse } from "@/lib/api";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonResponse({ user: null });
  return jsonResponse({ user: session });
}
