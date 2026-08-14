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

/** Add newer NotificationEventType values when upgrading. */
export async function migrateNotificationEnum(): Promise<void> {
  if (!(await tableExists("NotificationEvent"))) return;

  for (const value of ["WARNING_3", "RALLY_STARTED", "WARNING_60", "WARNING_30", "WARNING_15"]) {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS '${value}';
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
  }

  logger.info("migrated_notification_enum");
}

/** Add arrival offset + template pin columns when upgrading. */
export async function migrateFeaturePackColumns(): Promise<void> {
  if (await tableExists("RallyAssignment")) {
    if (!(await columnExists("RallyAssignment", "arrivalOffsetSeconds"))) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "RallyAssignment"
        ADD COLUMN IF NOT EXISTS "arrivalOffsetSeconds" INTEGER NOT NULL DEFAULT 0
      `);
      logger.info("migrated_arrival_offset_seconds");
    }
  }

  if (await tableExists("RallyEvent")) {
    if (!(await columnExists("RallyEvent", "pinned"))) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "RallyEvent"
        ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false
      `);
      logger.info("migrated_event_pinned");
    }
    if (!(await columnExists("RallyEvent", "sortOrder"))) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "RallyEvent"
        ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0
      `);
      logger.info("migrated_event_sort_order");
    }
  }

  if (await tableExists("User")) {
    if (!(await columnExists("User", "warningLeadsSeconds"))) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "warningLeadsSeconds" JSONB NOT NULL DEFAULT '[10, 5]'::jsonb
      `);
      // Copy legacy boolean prefs into the JSON array when present.
      await prisma.$executeRawUnsafe(`
        UPDATE "User"
        SET "warningLeadsSeconds" = (
          CASE
            WHEN "warn10Enabled" IS TRUE AND "warn5Enabled" IS TRUE THEN '[10, 5]'::jsonb
            WHEN "warn10Enabled" IS TRUE THEN '[10]'::jsonb
            WHEN "warn5Enabled" IS TRUE THEN '[5]'::jsonb
            ELSE '[]'::jsonb
          END
        )
      `);
      logger.info("migrated_warning_leads_seconds");
    }

    if (!(await columnExists("User", "lastCalibratedAt"))) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "lastCalibratedAt" TIMESTAMPTZ(3)
      `);
      logger.info("migrated_user_last_calibrated_at");
    }
    if (!(await columnExists("User", "lastLoginAt"))) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMPTZ(3)
      `);
      logger.info("migrated_user_last_login_at");
    }
    if (!(await columnExists("User", "lastSeenAt"))) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMPTZ(3)
      `);
      logger.info("migrated_user_last_seen_at");
    }
  }

  if (await tableExists("PushSubscription")) {
    if (!(await columnExists("PushSubscription", "lastCalibratedAt"))) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "PushSubscription"
        ADD COLUMN IF NOT EXISTS "lastCalibratedAt" TIMESTAMPTZ(3)
      `);
      logger.info("migrated_push_last_calibrated_at");
    }
    if (!(await columnExists("PushSubscription", "lastSeenAt"))) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "PushSubscription"
        ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMPTZ(3)
      `);
      logger.info("migrated_push_last_seen_at");
    }
    if (!(await columnExists("PushSubscription", "deviceId"))) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "PushSubscription"
        ADD COLUMN IF NOT EXISTS "deviceId" TEXT
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "PushSubscription_userId_deviceId_idx"
        ON "PushSubscription" ("userId", "deviceId")
      `);
      logger.info("migrated_push_device_id");
    }

    // Same phone often mints many endpoints (iOS re-subscribe). Keep the newest
    // active row per user + deviceId (or user-agent when deviceId is missing).
    const pruned = await prisma.$executeRawUnsafe(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY "userId", COALESCE("deviceId", COALESCE("userAgent", ''))
            ORDER BY COALESCE("lastSeenAt", "updatedAt") DESC, "updatedAt" DESC
          ) AS rn
        FROM "PushSubscription"
        WHERE active = true
      )
      UPDATE "PushSubscription" ps
      SET active = false
      FROM ranked r
      WHERE ps.id = r.id AND r.rn > 1 AND ps.active = true
    `);
    logger.info("pruned_duplicate_push_subscriptions", { pruned });
  }

  await migrateActivityLogTable();
}

/** Developer activity log (logins, device bind/unbind, push send results). */
export async function migrateActivityLogTable(): Promise<void> {
  if (!(await tableExists("ActivityLog"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ActivityLog" (
        "id" TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "kind" TEXT NOT NULL,
        "success" BOOLEAN NOT NULL DEFAULT true,
        "userId" TEXT,
        "username" TEXT,
        "displayName" TEXT,
        "deviceId" TEXT,
        "subscriptionId" TEXT,
        "platform" TEXT,
        "message" TEXT,
        "error" TEXT,
        "meta" JSONB,
        CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
      )
    `);
    logger.info("migrated_activity_log_table");
  }

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ActivityLog_kind_createdAt_idx" ON "ActivityLog"("kind", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt")
  `);
}

/** Ensure DEVELOPER role exists; promote the initial admin if none yet. */
export async function migrateDeveloperRole(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DEVELOPER';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  if (!(await tableExists("User"))) return;

  const developerCount = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM "User" WHERE role::text = 'DEVELOPER'
  `;
  if ((developerCount[0]?.count ?? 0) > 0) {
    logger.info("developer_role_already_present");
    return;
  }

  // Initial account (oldest user) gets Developer — matches "first user is developer".
  const promoted = await prisma.$executeRawUnsafe(`
    UPDATE "User"
    SET role = 'DEVELOPER'::"UserRole"
    WHERE id = (
      SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1
    )
    AND role::text IN ('ADMIN', 'CALLER')
  `);
  logger.info("migrated_initial_user_to_developer", { promoted });
}
