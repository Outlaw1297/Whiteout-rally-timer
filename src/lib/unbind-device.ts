import { normalizeDeviceId } from "@/lib/device-id";

export type UnbindWhere = {
  userId: string;
  active: true;
  OR: Array<{ endpoint: string } | { deviceId: string }>;
};

/**
 * Logout / unbind must target THIS install only.
 * Returning null is the safety valve — never deactivate every device on the account.
 */
export function buildUnbindWhere(opts: {
  userId: string;
  endpoint?: string | null;
  deviceId?: string | null;
}): UnbindWhere | null {
  if (!opts.userId) return null;
  const or: Array<{ endpoint: string } | { deviceId: string }> = [];
  const endpoint = typeof opts.endpoint === "string" ? opts.endpoint.trim() : "";
  if (endpoint) or.push({ endpoint });
  const deviceId = normalizeDeviceId(opts.deviceId);
  if (deviceId) or.push({ deviceId });
  if (or.length === 0) return null;
  return { userId: opts.userId, active: true, OR: or };
}
