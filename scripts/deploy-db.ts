/**
 * Production database deploy script.
 * Handles enum migration from legacy SCHEDULED status before prisma db push.
 */
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

async function addEnumValue(enumName: string, label: string) {
  if (await enumLabelExists(enumName, label)) return;
  await prisma.$executeRawUnsafe(
    `ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS '${label}'`
  );
}

async function migrateLegacyRallyStatus() {
  const hasScheduled = await enumLabelExists("RallyStatus", "SCHEDULED");
  if (!hasScheduled) return;

  await addEnumValue("RallyStatus", "DRAFT");
  await addEnumValue("RallyStatus", "READY");

  await prisma.$executeRawUnsafe(`
    UPDATE "Rally"
    SET status = 'READY'::"RallyStatus"
    WHERE status::text = 'SCHEDULED'
  `);

  console.log(JSON.stringify({ event: "migrated_scheduled_to_ready" }));
}

async function main() {
  try {
    await migrateLegacyRallyStatus();
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

  execSync("npx prisma db push --accept-data-loss", { stdio: "inherit" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
