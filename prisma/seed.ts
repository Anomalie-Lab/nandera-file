import { PrismaClient } from "@prisma/client";
import { seedStore } from "../src/lib/domain/seed";
import { saveStore } from "../src/lib/store-repository";

async function main() {
  const prisma = new PrismaClient();
  const count = await prisma.client.count();
  if (count > 0) {
    console.log(`DB already has ${count} client(s). Skipping seed.`);
    await prisma.$disconnect();
    return;
  }
  const store = seedStore();
  await saveStore(store);
  console.log(
    `Seeded ${store.clients.length} clients. Active: ${store.activeClientId}`
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
