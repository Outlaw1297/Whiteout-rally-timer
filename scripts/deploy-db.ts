/**
 * Production database deploy.
 *
 * Schema changes go through Prisma Migrate (`migrate deploy`) so every deploy
 * replays the same reviewed SQL. Databases created by the old `prisma db push`
 * path are baselined once against `0_init` before migrations resume.
 *
 * Schema steps fail the deploy. Render keeps the previous version running when
 * the build fails, which is safer than starting against a half-migrated schema.
 */
import { execSync } from "child_process";
import { prisma } from "../src/lib/prisma";
import { getDatabaseState } from "../src/lib/db-state";
import {
  migrateLegacyData,
  migrateTemplateSchema,
  migrateNotificationEnum,
  migrateFeaturePackColumns,
  migrateDeveloperRole,
} from "../src/lib/db-migrate";
import { initWebPush } from "../src/lib/push";

/** Migration that represents the schema as it existed under `prisma db push`. */
const BASELINE_MIGRATION = "0_init";

function log(event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...fields }));
}

function run(command: string) {
  execSync(command, { stdio: "inherit" });
}

/**
 * Upgrades pre-Migrate schemas (legacy column/enum shapes) so the baseline can
 * be recorded. Only meaningful before baselining; failures abort the deploy.
 */
async function runLegacyPreMigrations() {
  log("pre_migration_start");
  await migrateLegacyData();
  await migrateTemplateSchema();
  await migrateNotificationEnum();
  await migrateFeaturePackColumns();
  await migrateDeveloperRole();
  log("pre_migration_complete");
}

/**
 * Reports any difference between the live database and schema.prisma.
 *
 * Non-fatal on purpose: long-lived databases can carry harmless leftovers
 * (dropped models, old tables) that would otherwise block every deploy. CI
 * (`npm run db:verify`) is the hard gate for "schema changed, migration
 * missing"; this is the production-side visibility.
 */
function logLiveSchemaDrift() {
  try {
    const diff = execSync(
      "npx prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script",
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();

    const isEmpty = diff.length === 0 || /^--\s*This is an empty migration/i.test(diff);
    if (isEmpty) {
      log("live_schema_matches_datamodel");
      return;
    }
    console.warn(
      JSON.stringify({
        event: "live_schema_drift_detected",
        hint: "live database differs from schema.prisma — add a migration if the app needs these changes",
        diff: diff.split("\n").slice(0, 40),
      })
    );
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "schema_drift_check_skipped",
        reason: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

async function prepareSchema() {
  const state = await getDatabaseState();
  log("database_state_detected", { state });

  if (state === "needs-baseline") {
    // Built by `prisma db push`: bring legacy shapes up to date, then record
    // 0_init as already applied so migrate deploy does not recreate tables.
    await runLegacyPreMigrations();
    log("baselining_existing_database", { migration: BASELINE_MIGRATION });
    run(`npx prisma migrate resolve --applied ${BASELINE_MIGRATION}`);
  }

  run("npx prisma migrate deploy");
  log("migrate_deploy_complete");

  logLiveSchemaDrift();
}

async function main() {
  try {
    await prepareSchema();
  } finally {
    await prisma.$disconnect();
  }

  // Below here is runtime configuration, not schema. A failure should not block
  // the deploy: the app boots and retries VAPID init on startup.
  try {
    const ok = await initWebPush();
    log(ok ? "vapid_ready" : "vapid_init_failed");
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "vapid_init_warning",
        reason: err instanceof Error ? err.message : String(err),
      })
    );
  }

  try {
    run("npx tsx scripts/seed-admin.ts");
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
  console.error(
    JSON.stringify({
      event: "db_deploy_failed",
      error: err instanceof Error ? err.message : String(err),
    })
  );
  process.exit(1);
});
