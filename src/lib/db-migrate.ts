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

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const result = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
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

/**
 * Pre-migration for template-based schema (callerName, nullable times).
 * Must run before prisma db push when upgrading from the user-linked assignment model.
 */
export async function migrateTemplateSchema(): Promise<void> {
  if (!(await tableExists("RallyAssignment"))) return;

  if (!(await columnExists("RallyAssignment", "callerName"))) {
    logger.info("migrating_template_schema_add_caller_name");

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "RallyAssignment" ADD COLUMN IF NOT EXISTS "callerName" TEXT
    `);

    await prisma.$executeRawUnsafe(`
      UPDATE "RallyAssignment" ra
      SET "callerName" = u."displayName"
      FROM "User" u
      WHERE ra."userId" = u.id
        AND (ra."callerName" IS NULL OR ra."callerName" = '')
    `);

    await prisma.$executeRawUnsafe(`
      UPDATE "RallyAssignment"
      SET "callerName" = 'Caller ' || LEFT(id::text, 8)
      WHERE "callerName" IS NULL OR "callerName" = ''
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "RallyAssignment" ALTER COLUMN "callerName" SET NOT NULL
    `);
  }

  // Always dedupe before unique constraint is applied by prisma db push
  await prisma.$executeRawUnsafe(`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY "rallyEventId", "callerName"
          ORDER BY "createdAt"
        ) AS rn
      FROM "RallyAssignment"
    )
    UPDATE "RallyAssignment" ra
    SET "callerName" = ra."callerName" || ' (' || LEFT(ra.id::text, 4) || ')'
    FROM ranked r
    WHERE ra.id = r.id AND r.rn > 1
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "RallyAssignment" ALTER COLUMN "userId" DROP NOT NULL
  `).catch(() => {});

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "RallyAssignment" ALTER COLUMN "launchTime" DROP NOT NULL
  `).catch(() => {});

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "RallyAssignment" ALTER COLUMN "expectedArrivalTime" DROP NOT NULL
  `).catch(() => {});

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "RallyAssignment" DROP CONSTRAINT IF EXISTS "RallyAssignment_rallyEventId_userId_key"
  `);

  if (await tableExists("RallyEvent")) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "RallyEvent" ALTER COLUMN "targetArrivalTime" DROP NOT NULL
    `).catch(() => {});
  }

  logger.info("migrated_template_schema");
}
