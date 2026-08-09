import webpush from "web-push";
import { prisma } from "./prisma";
import { logger } from "./logger";

const CONFIG_ID = "default";

let initialized = false;
let activePublicKey: string | null = null;
let lastInitError: string | null = null;
let initPromise: Promise<boolean> | null = null;
let keySource: "env" | "database" | "generated" | null = null;

/** Strip quotes, accidental key prefixes, and base64 padding from env values. */
export function normalizeVapidKey(key: string | undefined): string | null {
  if (!key) return null;

  let normalized = key.trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  normalized = normalized.replace(/^VAPID_(PUBLIC|PRIVATE)_KEY=/i, "").trim();
  normalized = normalized.replace(/\s+/g, "");
  normalized = normalized.replace(/=+$/, "");

  return normalized || null;
}

function getSubject(): string {
  return (process.env.VAPID_SUBJECT || "mailto:admin@example.com").trim();
}

function isPlausibleVapidKey(key: string): boolean {
  return key.length >= 40 && /^[A-Za-z0-9_-]+$/.test(key);
}

function trySetVapid(subject: string, publicKey: string, privateKey: string): boolean {
  if (!isPlausibleVapidKey(publicKey) || !isPlausibleVapidKey(privateKey)) {
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return true;
  } catch {
    return false;
  }
}

function markReady(
  publicKey: string,
  source: "env" | "database" | "generated"
): boolean {
  initialized = true;
  activePublicKey = publicKey;
  keySource = source;
  lastInitError = null;
  return true;
}

async function loadFromDatabase(): Promise<{
  publicKey: string;
  privateKey: string;
  subject: string;
  source: string;
} | null> {
  const row = await prisma.vapidConfig.findUnique({ where: { id: CONFIG_ID } });
  if (!row) return null;
  return {
    publicKey: row.publicKey,
    privateKey: row.privateKey,
    subject: row.subject,
    source: row.source,
  };
}

async function saveToDatabase(
  publicKey: string,
  privateKey: string,
  subject: string,
  source: "env" | "database" | "generated"
) {
  await prisma.vapidConfig.upsert({
    where: { id: CONFIG_ID },
    create: { id: CONFIG_ID, publicKey, privateKey, subject, source },
    update: { publicKey, privateKey, subject, source },
  });
}

async function generateAndStore(subject: string) {
  const keys = webpush.generateVAPIDKeys();
  await saveToDatabase(keys.publicKey, keys.privateKey, subject, "generated");
  console.log(
    JSON.stringify({
      event: "vapid_auto_generated",
      message: "Created new VAPID key pair and saved to database",
    })
  );
  return keys;
}

async function resolveVapidKeys(): Promise<boolean> {
  const subject = getSubject();

  // Prefer persisted keys so bad Render env vars cannot break push after auto-setup.
  const stored = await loadFromDatabase();
  if (
    stored &&
    trySetVapid(stored.subject, stored.publicKey, stored.privateKey)
  ) {
    const source =
      stored.source === "env" || stored.source === "generated"
        ? stored.source
        : "database";
    return markReady(stored.publicKey, source);
  }

  const envPublic = normalizeVapidKey(process.env.VAPID_PUBLIC_KEY);
  const envPrivate = normalizeVapidKey(process.env.VAPID_PRIVATE_KEY);
  if (envPublic && envPrivate && trySetVapid(subject, envPublic, envPrivate)) {
    await saveToDatabase(envPublic, envPrivate, subject, "env");
    console.log(
      JSON.stringify({
        event: "vapid_from_env",
        message: "Using VAPID keys from environment variables",
      })
    );
    return markReady(envPublic, "env");
  }

  if (envPublic || envPrivate) {
    console.warn(
      JSON.stringify({
        event: "vapid_env_ignored",
        message:
          "Invalid or incomplete VAPID env vars ignored — auto-generating keys instead",
      })
    );
  }

  const generated = await generateAndStore(subject);
  if (trySetVapid(subject, generated.publicKey, generated.privateKey)) {
    return markReady(generated.publicKey, "generated");
  }

  lastInitError = "Failed to generate valid VAPID keys";
  return false;
}

export async function initWebPush(): Promise<boolean> {
  if (initialized) return true;
  if (!initPromise) {
    initPromise = resolveVapidKeys().catch((err) => {
      lastInitError = err instanceof Error ? err.message : String(err);
      logger.error("vapid_init_failed", { error: lastInitError });
      return false;
    });
  }
  return initPromise;
}

export interface VapidDiagnostics {
  configured: boolean;
  hasPublicKey: boolean;
  hasPrivateKey: boolean;
  publicKeyLength: number;
  privateKeyLength: number;
  error: string | null;
  source: string | null;
  autoManaged: boolean;
}

export async function getVapidDiagnostics(): Promise<VapidDiagnostics> {
  await initWebPush();

  const envPublic = normalizeVapidKey(process.env.VAPID_PUBLIC_KEY);
  const envPrivate = normalizeVapidKey(process.env.VAPID_PRIVATE_KEY);
  const stored = await loadFromDatabase().catch(() => null);

  return {
    configured: initialized,
    hasPublicKey: !!(envPublic || stored?.publicKey || activePublicKey),
    hasPrivateKey: !!(envPrivate || stored?.privateKey),
    publicKeyLength: (activePublicKey || envPublic || stored?.publicKey || "").length,
    privateKeyLength: (envPrivate || stored?.privateKey || "").length,
    error: lastInitError,
    source: keySource,
    autoManaged: keySource === "database" || keySource === "generated",
  };
}

export function isVapidConfigured(): boolean {
  return initialized;
}

export async function getVapidPublicKey(): Promise<string | null> {
  if (!(await initWebPush())) return null;
  return activePublicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  rallyId: string;
  notificationType: string;
  assignmentId?: string;
}

export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  if (!(await initWebPush())) {
    return { success: false, error: lastInitError || "VAPID not configured" };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload),
      { TTL: 60, urgency: "high" }
    );
    return { success: true };
  } catch (err: unknown) {
    const error = err as { statusCode?: number; message?: string };
    logger.error("push_send_failed", {
      statusCode: error.statusCode,
      error: error.message,
    });
    return {
      success: false,
      statusCode: error.statusCode,
      error: error.message || "Unknown push error",
    };
  }
}

export function isExpiredSubscription(statusCode?: number): boolean {
  return statusCode === 404 || statusCode === 410;
}
