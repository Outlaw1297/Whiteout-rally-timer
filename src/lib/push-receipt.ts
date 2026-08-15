import crypto from "crypto";

const RECEIPT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function receiptSecret(): string {
  return process.env.SESSION_SECRET || "dev-session-secret-min-32-chars!!";
}

function signature(dispatchId: string, expiresAt: number): string {
  return crypto
    .createHmac("sha256", receiptSecret())
    .update(`${dispatchId}.${expiresAt}`)
    .digest("base64url");
}

export function createPushReceiptToken(dispatchId: string): string {
  const expiresAt = Date.now() + RECEIPT_TOKEN_TTL_MS;
  return `${expiresAt}.${signature(dispatchId, expiresAt)}`;
}

export function verifyPushReceiptToken(dispatchId: string, token: unknown): boolean {
  if (typeof token !== "string") return false;
  const [expiresRaw, supplied] = token.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || !supplied) return false;

  const expected = signature(dispatchId, expiresAt);
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    crypto.timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

export function pushFingerprint(value: string | null | undefined): string | null {
  if (!value) return null;
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}
