import { prisma } from "./prisma";
import { logger } from "./logger";

async function enumLabelExists(enumName: string, label: string): Promise<boolean> {
  const result = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = ${enumName}
        AND e.enumlabel = ${label}
    ) AS exists
  `;
  return result[0]?.exists ?? false;
}

async function ensureEnumValue(enumName: string, label: string) {
  if (await enumLabelExists(enumName, label)) return;
  await prisma.$executeRawUnsafe(
    `ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS '${label}'`
  );
}

/**
 * Migrates legacy SCHEDULED rallies and repairs enum mismatches.
 * Safe to run on every server startup.
 */
export async function migrateLegacyData(): Promise<void> {
  const labels = ["DRAFT", "READY", "ACTIVE", "COMPLETED", "CANCELLED", "SCHEDULED"];
  for (const label of labels) {
    await ensureEnumValue("RallyStatus", label);
  }

  const scheduledCount = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM "Rally"
    WHERE status::text = 'SCHEDULED'
  `;

  const count = scheduledCount[0]?.count ?? 0;
  if (count === 0) return;

  await prisma.$executeRawUnsafe(`
    UPDATE "Rally"
    SET status = CASE
      WHEN cancelled = true THEN 'CANCELLED'::"RallyStatus"
      WHEN "rallyTime" IS NOT NULL AND "rallyTime" <= NOW() THEN 'COMPLETED'::"RallyStatus"
      WHEN "rallyTime" IS NOT NULL AND "rallyTime" > NOW() THEN 'ACTIVE'::"RallyStatus"
      ELSE 'READY'::"RallyStatus"
    END
    WHERE status::text = 'SCHEDULED'
  `);

  logger.info("migrated_legacy_scheduled_rallies", { count });
}
