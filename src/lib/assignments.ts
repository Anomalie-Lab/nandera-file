import type { Prisma, PrismaClient } from "@prisma/client";
import { UserAdminError } from "./users";

type Db = PrismaClient | Prisma.TransactionClient;

export type ClientAssignmentRow = {
  clientId: string;
  clientName: string;
  sellerId: string | null;
  sellerEmail: string | null;
};

export async function listClientAssignments(
  db: Db
): Promise<ClientAssignmentRow[]> {
  const rows = await db.client.findMany({
    orderBy: { client: "asc" },
    select: {
      id: true,
      client: true,
      sellerId: true,
      seller: { select: { email: true } },
    },
  });
  return rows.map((r) => ({
    clientId: r.id,
    clientName: r.client,
    sellerId: r.sellerId,
    sellerEmail: r.seller?.email ?? null,
  }));
}

export async function assignClientSeller(
  db: Db,
  clientId: string,
  sellerId: string | null
): Promise<ClientAssignmentRow> {
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) throw new UserAdminError("Client not found.");

  let sellerEmail: string | null = null;
  if (sellerId) {
    const seller = await db.user.findUnique({ where: { id: sellerId } });
    if (!seller || seller.role !== "SELLER") {
      throw new UserAdminError("Seller must be a user with role SELLER.");
    }
    sellerEmail = seller.email;
  }

  const updated = await db.client.update({
    where: { id: clientId },
    data: {
      sellerId,
      ...(sellerEmail ? { accountManager: sellerEmail } : {}),
    },
    select: {
      id: true,
      client: true,
      sellerId: true,
      seller: { select: { email: true } },
    },
  });

  return {
    clientId: updated.id,
    clientName: updated.client,
    sellerId: updated.sellerId,
    sellerEmail: updated.seller?.email ?? null,
  };
}
