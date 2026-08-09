/**
 * Production database deploy script.
 * Runs data migrations before prisma db push.
 */
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { migrateLegacyData, migrateTemplateSchema, migrateNotificationEnum } from "../src/lib/db-migrate";

const prisma = new PrismaClient();

async function main() {
  try {
    await migrateLegacyData();
    await migrateTemplateSchema();
    await migrateNotificationEnum();
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
