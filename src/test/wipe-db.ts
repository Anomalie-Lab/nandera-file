import { prisma } from "@/lib/db";

export async function wipeDb() {
  await prisma.user.deleteMany();
  await prisma.closedDeal.deleteMany();
  await prisma.actionItem.deleteMany();
  await prisma.negotiation.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.client.deleteMany();
  await prisma.appState.deleteMany();
}
