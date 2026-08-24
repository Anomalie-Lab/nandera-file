import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { wipeDb } from "@/test/wipe-db";
import { hashPassword } from "@/lib/passwords";
import {
  assignClientSeller,
  listClientAssignments,
} from "@/lib/assignments";
import {
  SUPERADMIN_EMAIL,
  assignedClientIdsForSeller,
  createStaffUser,
  UserAdminError,
} from "@/lib/users";
import {
  saveStoreForSeller,
  scopeStoreForSeller,
} from "@/lib/store-repository";
import { blankData } from "@/lib/domain/normalize";
import type { Store } from "@/lib/domain/types";

describe("seller client assignments", () => {
  beforeEach(async () => {
    await wipeDb();
  });

  afterAll(async () => {
    await wipeDb();
  });

  it("assigns one seller per client and scopes the seller portfolio", async () => {
    await prisma.user.create({
      data: {
        email: SUPERADMIN_EMAIL,
        passwordHash: hashPassword("super-pass-12"),
        role: "SUPERADMIN",
      },
    });
    const seller = await createStaffUser(prisma, {
      email: "vendedor@nandera.com",
      password: "SellerPass9",
      role: "SELLER",
    });
    expect(seller.role).toBe("SELLER");

    await prisma.client.create({
      data: { id: "c1", client: "Cliente Um" },
    });
    await prisma.client.create({
      data: { id: "c2", client: "Cliente Dois" },
    });

    const a1 = await assignClientSeller(prisma, "c1", seller.id);
    expect(a1.sellerId).toBe(seller.id);
    expect(a1.sellerEmail).toBe("vendedor@nandera.com");

    const ids = await assignedClientIdsForSeller(prisma, seller.id);
    expect(ids).toEqual(["c1"]);

    const list = await listClientAssignments(prisma);
    expect(list.find((x) => x.clientId === "c1")?.sellerEmail).toBe(
      "vendedor@nandera.com"
    );
    expect(list.find((x) => x.clientId === "c2")?.sellerId).toBeNull();

    await expect(
      assignClientSeller(prisma, "c1", "not-a-seller")
    ).rejects.toBeInstanceOf(UserAdminError);
  });

  it("saveStoreForSeller only updates assigned clients", async () => {
    const seller = await createStaffUser(prisma, {
      email: "vendedor@nandera.com",
      password: "SellerPass9",
      role: "SELLER",
    });
    const c1 = { id: "c1", data: blankData("A") };
    const c2 = { id: "c2", data: blankData("B") };
    await prisma.appState.create({
      data: { id: 1, activeClientId: "c1", deliveredMode: "Hidden" },
    });
    await prisma.client.create({ data: { id: "c1", client: "A", sellerId: seller.id } });
    await prisma.client.create({ data: { id: "c2", client: "B" } });

    const payload: Store = {
      activeClientId: "c1",
      logo: null,
      settings: { deliveredMode: "Hidden" },
      clients: [
        {
          id: "c1",
          data: { ...blankData("A Renamed"), meta: { ...blankData("A Renamed").meta, client: "A Renamed" } },
        },
      ],
    };

    const saved = await saveStoreForSeller(payload, ["c1"], seller.id);
    const scoped = scopeStoreForSeller(saved, ["c1"]);
    expect(scoped.clients).toHaveLength(1);
    expect(scoped.clients[0].data.meta.client).toBe("A Renamed");

    const other = await prisma.client.findUnique({ where: { id: "c2" } });
    expect(other?.client).toBe("B");

    await expect(
      saveStoreForSeller(
        {
          ...payload,
          clients: [{ id: "c2", data: blankData("Hack") }],
        },
        ["c1"],
        seller.id
      )
    ).resolves.toBeDefined();

    const hacked = await prisma.client.findUnique({ where: { id: "c2" } });
    expect(hacked?.client).toBe("B");
  });

  it("ignores unassigned existing clients in seller payload (stale UI)", async () => {
    const seller = await createStaffUser(prisma, {
      email: "vendedor@nandera.com",
      password: "SellerPass9",
      role: "SELLER",
    });
    await prisma.appState.create({
      data: { id: 1, activeClientId: "c1", deliveredMode: "Hidden" },
    });
    await prisma.client.create({ data: { id: "c1", client: "A", sellerId: seller.id } });
    await prisma.client.create({ data: { id: "c2", client: "B" } });

    const saved = await saveStoreForSeller(
      {
        activeClientId: "c1",
        logo: null,
        settings: { deliveredMode: "Hidden" },
        clients: [
          {
            id: "c1",
            data: {
              ...blankData("A updated"),
              meta: { ...blankData("A updated").meta, client: "A updated" },
            },
          },
          { id: "c2", data: blankData("B hacked") },
        ],
      },
      ["c1"],
      seller.id
    );

    expect(saved.clients.find((c) => c.id === "c1")?.data.meta.client).toBe(
      "A updated"
    );
    const other = await prisma.client.findUnique({ where: { id: "c2" } });
    expect(other?.client).toBe("B");
  });

  it("rejects duplicate client name on seller create", async () => {
    const seller = await createStaffUser(prisma, {
      email: "vendedor2@nandera.com",
      password: "SellerPass9",
      role: "SELLER",
    });
    await prisma.appState.create({
      data: { id: 1, activeClientId: "c1", deliveredMode: "Hidden" },
    });
    await prisma.client.create({ data: { id: "c1", client: "Existing" } });

    await expect(
      saveStoreForSeller(
        {
          activeClientId: "new1",
          logo: null,
          settings: { deliveredMode: "Hidden" },
          clients: [{ id: "new1", data: blankData("Existing") }],
        },
        [],
        seller.id
      )
    ).rejects.toThrow(/already exists/i);
  });

  it("seller can create a client and it is auto-assigned", async () => {
    const seller = await createStaffUser(prisma, {
      email: "vendedor@nandera.com",
      password: "SellerPass9",
      role: "SELLER",
    });
    await prisma.appState.create({
      data: { id: 1, activeClientId: "", deliveredMode: "Hidden" },
    });

    const payload: Store = {
      activeClientId: "new1",
      logo: null,
      settings: { deliveredMode: "Hidden" },
      clients: [{ id: "new1", data: blankData("Cliente Novo") }],
    };

    const saved = await saveStoreForSeller(payload, [], seller.id);
    const row = await prisma.client.findUnique({ where: { id: "new1" } });
    expect(row?.client).toBe("Cliente Novo");
    expect(row?.sellerId).toBe(seller.id);

    const ids = await assignedClientIdsForSeller(prisma, seller.id);
    expect(ids).toEqual(["new1"]);

    const scoped = scopeStoreForSeller(saved, ids);
    expect(scoped.clients).toHaveLength(1);
    expect(scoped.clients[0].id).toBe("new1");
  });

  it("creates only one new client when several are sent (uses activeClientId)", async () => {
    const seller = await createStaffUser(prisma, {
      email: "vendedor@nandera.com",
      password: "SellerPass9",
      role: "SELLER",
    });
    await prisma.appState.create({
      data: { id: 1, activeClientId: "", deliveredMode: "Hidden" },
    });

    const saved = await saveStoreForSeller(
      {
        activeClientId: "a",
        logo: null,
        settings: { deliveredMode: "Hidden" },
        clients: [
          { id: "a", data: blankData("A") },
          { id: "b", data: blankData("B") },
        ],
      },
      [],
      seller.id
    );

    expect(saved.clients.find((c) => c.id === "a")?.data.meta.client).toBe("A");
    expect(saved.clients.find((c) => c.id === "b")).toBeUndefined();
    expect(await prisma.client.findUnique({ where: { id: "a" } })).toBeTruthy();
    expect(await prisma.client.findUnique({ where: { id: "b" } })).toBeNull();
  });
});
