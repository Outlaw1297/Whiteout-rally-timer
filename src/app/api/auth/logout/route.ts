import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, getSessionFromRequest } from "@/lib/session";
import { normalizeDeviceId } from "@/lib/device-id";
import { unbindCurrentDevice } from "@/lib/push-devices";
import { writeActivityLog } from "@/lib/write-activity-log";
import { detectPlatformFromUA } from "@/lib/device-platform";

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  let body: { endpoint?: string; deviceId?: string } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    body = {};
  }

  const deviceId = normalizeDeviceId(body.deviceId);
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : null;
  const platform = detectPlatformFromUA(request.headers.get("user-agent"));

  let unbound = 0;
  if (session) {
    const result = await unbindCurrentDevice({
      userId: session.id,
      username: session.username,
      displayName: session.displayName,
      endpoint,
      deviceId,
    });
    unbound = result.unbound;

    await writeActivityLog({
      kind: "LOGOUT",
      success: true,
      userId: session.id,
      username: session.username,
      displayName: session.displayName,
      deviceId,
      platform,
      message:
        unbound > 0
          ? `${session.displayName} signed out · this device stopped receiving alerts`
          : `${session.displayName} signed out`,
      meta: { unbound, platform },
    });
  }

  const response = NextResponse.json({ success: true, unbound });
  clearSessionCookie(response);
  return response;
}
