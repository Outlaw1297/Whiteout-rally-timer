/**
 * Checks that prisma/migrations still fully describes prisma/schema.prisma.
 *
 * Run after editing the schema: if this fails, a migration is missing and the
 * deploy would leave production behind the code.
 *
 * Needs a throwaway shadow database:
 *   SHADOW_DATABASE_URL=postgresql://... npm run db:verify
 */
import { execFileSync } from "child_process";

const shadowUrl = process.env.SHADOW_DATABASE_URL;

if (!shadowUrl) {
  console.error(
    JSON.stringify({
      event: "shadow_database_url_missing",
      hint: "SHADOW_DATABASE_URL must point at an empty database Prisma can reset",
    })
  );
  process.exit(1);
}

try {
  execFileSync(
    "npx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-migrations",
      "prisma/migrations",
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--shadow-database-url",
      shadowUrl,
      "--exit-code",
    ],
    { stdio: "inherit" }
  );
  console.log(JSON.stringify({ event: "migrations_match_schema" }));
} catch {
  console.error(
    JSON.stringify({
      event: "migrations_out_of_date",
      hint: "npx prisma migrate dev --name <change> to generate the missing migration",
    })
  );
  process.exit(1);
}
