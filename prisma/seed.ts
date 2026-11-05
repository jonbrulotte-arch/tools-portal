import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { syncToolRegistry } from "../src/lib/tools/sync";

async function main() {
  await syncToolRegistry();

  const superAdmin = await prisma.role.upsert({
    where: { name: "Super Admin" },
    create: { name: "Super Admin", description: "Full access to every tool and admin module.", isSystem: true, isSuperAdmin: true },
    update: { isSystem: true, isSuperAdmin: true },
  });
  await prisma.role.upsert({
    where: { name: "User" },
    create: { name: "User", description: "Standard employee. Tool access is granted per role or per user.", isSystem: true },
    update: { isSystem: true },
  });

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await prisma.user.create({
        data: {
          email,
          name: process.env.SEED_ADMIN_NAME?.trim() || "Administrator",
          passwordHash: await bcrypt.hash(password, 12),
          status: "ACTIVE",
          roleId: superAdmin.id,
        },
      });
      console.log(`Created admin user ${email}`);
    } else {
      console.log(`Admin user ${email} already exists, left unchanged`);
    }
  } else {
    console.log("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set; no admin created");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
