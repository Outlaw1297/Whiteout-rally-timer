/**
 * Production database deploy script.
 * Runs data migrations before prisma db push.
 */
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { migrateLegacyData, migrateTemplateSchema, migrateNotificationEnum, migrateFeaturePackColumns } from "../src/lib/db-migrate";
import { initWebPush } from "../src/lib/push";

const prisma = new PrismaClient();

async function main() {
  try {
    await migrateLegacyData();
    await migrateTemplateSchema();
    await migrateNotificationEnum();
    await migrateFeaturePackColumns();
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "pre_migration_warning",
        reason: err instanceof Error ? err.message : String(err),
      })
    );
  } finally {
    await prisma.$disconnect();
  }

  // --accept-data-loss is required when adding unique constraints; data is preserved via pre-migration.
  execSync("npx prisma db push --accept-data-loss", { stdio: "inherit" });

  try {
    const ok = await initWebPush();
    console.log(
      JSON.stringify({
        event: ok ? "vapid_ready" : "vapid_init_failed",
        message: ok
          ? "VAPID keys ready (auto-generated if needed)"
          : "VAPID init failed during deploy",
      })
    );
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "vapid_init_warning",
        reason: err instanceof Error ? err.message : String(err),
      })
    );
  }

  try {
    execSync("npx tsx scripts/seed-admin.ts", { stdio: "inherit" });
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "seed_skipped",
        reason: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
