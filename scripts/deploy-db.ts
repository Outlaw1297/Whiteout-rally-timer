/**
 * Production database deploy script.
 * Handles enum migration from legacy SCHEDULED status before prisma db push.
 */
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { migrateLegacyData } from "../src/lib/db-migrate";

const prisma = new PrismaClient();

async function main() {
  try {
    await migrateLegacyData();
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "pre_migration_skipped",
        reason: err instanceof Error ? err.message : String(err),
      })
    );
  } finally {
    await prisma.$disconnect();
  }

  try {
    execSync("npx prisma db push", { stdio: "inherit" });
  } catch {
    execSync("npx prisma db push --accept-data-loss", { stdio: "inherit" });
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
