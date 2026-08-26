import { readdirSync } from "fs";
import path from "path";
import { prisma } from "./prisma";

/** Tables that only exist once the app schema has been created. */
const APP_TABLE = "User";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

async function regclassExists(qualifiedName: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ oid: string | null }[]>`
    SELECT to_regclass(${qualifiedName})::text AS oid
  `;
  return !!rows[0]?.oid;
}

/** True once Prisma Migrate has recorded any migration in this database. */
export async function hasMigrationHistory(): Promise<boolean> {
  return regclassExists("public._prisma_migrations");
}

/** True when the app schema already exists (created by migrate or legacy db push). */
export async function hasApplicationTables(): Promise<boolean> {
  return regclassExists(`public."${APP_TABLE}"`);
}

export type DatabaseState =
  /** Empty database — migrations create everything. */
  | "empty"
  /** Schema exists but predates Prisma Migrate (built by `prisma db push`). */
  | "needs-baseline"
  /** Already under Prisma Migrate control. */
  | "migrated";

export async function getDatabaseState(): Promise<DatabaseState> {
  if (await hasMigrationHistory()) return "migrated";
  if (await hasApplicationTables()) return "needs-baseline";
  return "empty";
}

function migrationsOnDisk(): string[] {
  try {
    return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Migration directories that this database has not recorded as applied.
 * Read-only: startup reports drift instead of mutating the schema.
 */
export async function getPendingMigrations(): Promise<string[]> {
  const onDisk = migrationsOnDisk();
  if (onDisk.length === 0) return [];
  if (!(await hasMigrationHistory())) return onDisk;

  const applied = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
  `;
  const appliedNames = new Set(applied.map((row) => row.migration_name));
  return onDisk.filter((name) => !appliedNames.has(name));
}
