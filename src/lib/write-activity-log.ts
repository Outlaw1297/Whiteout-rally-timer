import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { ActivityLogInput } from "@/lib/activity-log";

const LOG_RETENTION_DAYS = 14;
const LOG_MAX_ROWS = 4000;

function toRow(input: ActivityLogInput) {
  const success = input.success ?? !input.error;
  return {
    kind: input.kind,
    success,
    userId: input.userId ?? null,
    username: input.username ?? null,
    displayName: input.displayName ?? null,
    deviceId: input.deviceId ?? null,
    subscriptionId: input.subscriptionId ?? null,
    platform: input.platform ?? null,
    message: input.message ?? null,
    error: input.error ?? null,
    meta:
      input.meta == null
        ? undefined
        : (input.meta as Prisma.InputJsonObject),
  };
}

async function pruneActivityLogs(): Promise<void> {
  const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.activityLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  const extras = await prisma.activityLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: LOG_MAX_ROWS,
    select: { id: true },
  });
  if (extras.length > 0) {
    await prisma.activityLog.deleteMany({
      where: { id: { in: extras.map((row) => row.id) } },
    });
  }
}

/** Never throws — logging must not break login, subscribe, or rally sends. */
export async function writeActivityLog(input: ActivityLogInput): Promise<void> {
  try {
    await prisma.activityLog.create({ data: toRow(input) });
    if (Math.random() < 0.05) await pruneActivityLogs();
  } catch (err) {
    logger.warn("activity_log_write_failed", {
      kind: input.kind,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function writeActivityLogs(inputs: ActivityLogInput[]): Promise<void> {
  if (inputs.length === 0) return;
  try {
    await prisma.activityLog.createMany({ data: inputs.map(toRow) });
    if (Math.random() < 0.08) await pruneActivityLogs();
  } catch (err) {
    logger.warn("activity_log_write_failed", {
      count: inputs.length,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
