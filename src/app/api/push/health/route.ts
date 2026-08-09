import { jsonResponse } from "@/lib/api";
import { getVapidDiagnostics, initWebPush } from "@/lib/push";

/** Public health check for VAPID configuration (no secrets exposed). */
export async function GET() {
  initWebPush();
  const diagnostics = getVapidDiagnostics();

  return jsonResponse({
    pushEnabled: diagnostics.configured,
    hasPublicKey: diagnostics.hasPublicKey,
    hasPrivateKey: diagnostics.hasPrivateKey,
    error: diagnostics.error,
    hint: diagnostics.configured
      ? null
      : diagnostics.error?.includes("32 bytes")
        ? "Private key is invalid — regenerate both keys with npm run generate:vapid"
        : diagnostics.error?.includes("65 bytes")
          ? "Public key is invalid — regenerate both keys with npm run generate:vapid"
          : !diagnostics.hasPublicKey || !diagnostics.hasPrivateKey
            ? "Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Render environment"
            : "Keys are present but invalid — generate a fresh matching pair",
  });
}
