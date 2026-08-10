/**
 * Seeds developer/admin user and optional callers on first deploy.
 * The initial account is always granted the DEVELOPER role.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

async function main() {
  const count = await prisma.user.count();
  if (count > 0) {
    // Ensure at least one developer exists on upgrades.
    const developers = await prisma.user.count({ where: { role: "DEVELOPER" } });
    if (developers === 0) {
      const first = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
      if (first) {
        await prisma.user.update({
          where: { id: first.id },
          data: { role: "DEVELOPER" },
        });
        console.log(
          JSON.stringify({
            event: "seed_promoted_initial_developer",
            username: first.username,
          })
        );
      }
    } else {
      console.log(JSON.stringify({ event: "seed_skipped", reason: "users_exist", count }));
    }
    return;
  }

  const adminUsername = (process.env.ADMIN_USERNAME || "admin").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "changeme-admin-123";
  const adminDisplay = process.env.ADMIN_DISPLAY_NAME || "Admin";

  const admin = await prisma.user.create({
    data: {
      username: adminUsername,
      displayName: adminDisplay,
      passwordHash: await bcrypt.hash(adminPassword, SALT_ROUNDS),
      role: "DEVELOPER",
    },
  });

  console.log(
    JSON.stringify({
      event: "seed_developer_created",
      username: admin.username,
      temporaryPassword: process.env.ADMIN_PASSWORD ? undefined : adminPassword,
    })
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
