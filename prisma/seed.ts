import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.log("ADMIN_USERNAME/ADMIN_PASSWORD not set. Skipping seed.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.adminUser.findUnique({ where: { username } });

  if (!existing) {
    await prisma.adminUser.create({ data: { username, passwordHash } });
    console.log("Admin user created.");
    return;
  }

  await prisma.adminUser.update({
    where: { id: existing.id },
    data: { passwordHash },
  });
  console.log("Admin user password updated from env.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
