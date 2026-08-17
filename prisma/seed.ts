import { PrismaClient } from "@prisma/client";
import { seedStore } from "../src/lib/domain/seed";
import { saveStore } from "../src/lib/store-repository";
import {
  NANDERA_ADMINS,
  ensureAdminUsers,
  ensureMissingClientUsers,
  migrateClientUsernames,
} from "../src/lib/users";

async function main() {
  const prisma = new PrismaClient();
  const count = await prisma.client.count();
  if (count === 0) {
    const store = seedStore();
    await saveStore(store);
    console.log(
      `Seeded ${store.clients.length} clients. Active: ${store.activeClientId}`
    );
  } else {
    console.log(`DB already has ${count} client(s). Skipping client seed.`);
    const made = await ensureMissingClientUsers(prisma);
    if (made) console.log(`Created ${made} missing client portal user(s).`);
  }

  const created = await ensureAdminUsers(prisma);
  await migrateClientUsernames(prisma);
  console.log("\nNandera admin users:");
  for (const admin of NANDERA_ADMINS) {
    const mark = created.includes(admin.email.toLowerCase())
      ? "created"
      : "exists";
    console.log(`  ${admin.email}  (${mark})`);
    if (mark === "created") {
      console.log(`    password: ${admin.password}`);
    }
  }

  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    include: { client: { select: { client: true } } },
    orderBy: { email: "asc" },
  });
  if (clients.length) {
    console.log("\nClient portal logins (share with each customer):");
    for (const u of clients) {
      console.log(
        `  ${u.client?.client || u.clientId}: ${u.email} / ${u.passwordPlain || "(hidden)"}`
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
