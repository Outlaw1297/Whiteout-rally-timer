import { jsonResponse } from "@/lib/api";
import { getVapidDiagnostics, initWebPush } from "@/lib/push";

/** Public health check for VAPID configuration (no secrets exposed). */
export async function GET() {
  await initWebPush();
  const diagnostics = await getVapidDiagnostics();

  return jsonResponse({
    pushEnabled: diagnostics.configured,
    hasPublicKey: diagnostics.hasPublicKey,
    hasPrivateKey: diagnostics.hasPrivateKey,
    source: diagnostics.source,
    autoManaged: diagnostics.autoManaged,
    error: diagnostics.error,
    hint: diagnostics.configured
      ? "Push is ready — enable notifications on your device"
      : diagnostics.error || "Push initialization failed — check server logs",
  });
}
