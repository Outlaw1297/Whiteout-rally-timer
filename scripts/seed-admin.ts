/**
 * Seeds admin user and optional callers on first deploy.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

async function main() {
  const count = await prisma.user.count();
  if (count > 0) {
    console.log(JSON.stringify({ event: "seed_skipped", reason: "users_exist", count }));
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
      role: "ADMIN",
    },
  });

  console.log(
    JSON.stringify({
      event: "seed_admin_created",
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
