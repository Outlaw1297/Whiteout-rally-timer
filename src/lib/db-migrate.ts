import { prisma } from "./prisma";
import { logger } from "./logger";

async function tableExists(tableName: string): Promise<boolean> {
  const result = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS exists
  `;
  return result[0]?.exists ?? false;
}

/**
 * Migrates legacy Rally table data if present. Safe to run on every startup.
 */
export async function migrateLegacyData(): Promise<void> {
  if (!(await tableExists("Rally"))) return;

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
