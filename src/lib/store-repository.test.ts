import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { loadStore, saveStore, resetStore } from "@/lib/store-repository";
import { seedStore } from "@/lib/domain/seed";
import { computeClientKpis } from "@/lib/domain/business";

/**
 * Integration tests against a temporary SQLite file.
 * Uses the same repository as production.
 */
describe("store repository (SQLite)", () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.closedDeal.deleteMany();
    await prisma.actionItem.deleteMany();
    await prisma.negotiation.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.client.deleteMany();
    await prisma.appState.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("seeds, loads, and round-trips KPIs", async () => {
    const seeded = seedStore();
    await saveStore(seeded);
    const loaded = await loadStore();

    expect(loaded.clients.length).toBe(2);
    expect(loaded.settings.deliveredMode).toBe("Hidden");
    expect(loaded.logo).toBeNull();

    const a = seeded.clients[0];
    const b = loaded.clients.find((c) => c.data.meta.client === a.data.meta.client)!;
    expect(b).toBeTruthy();
    expect(computeClientKpis(b.data)).toEqual(computeClientKpis(a.data));
    expect(b.data.pos.length).toBe(a.data.pos.length);
    expect(b.data.neg.length).toBe(a.data.neg.length);
  });

  it("persists field updates and wonPo", async () => {
    const store = await loadStore();
    const client = store.clients[0];
    client.data.meta.period = "August 2026";
    const open = client.data.neg.find((n) => n.outcome === "Open")!;
    const draftId = "draftpo1";
    client.data.pos.unshift({
      id: draftId,
      code: "",
      ndr: "",
      product: open.topic,
      qty: "",
      value: Number(open.value) || 0,
      incoterm: "",
      prod: 0,
      insp: "Pending",
      inspDate: "",
      cargoReady: "",
      eta: "",
      port: "",
      stage: "Confirmed",
    });
    open.outcome = "Won";
    open.wonPo = draftId;

    await saveStore(store);
    const again = await loadStore();
    const c = again.clients.find((x) => x.id === client.id)!;
    expect(c.data.meta.period).toBe("August 2026");
    const n = c.data.neg.find((x) => x.id === open.id)!;
    expect(n.outcome).toBe("Won");
    expect(n.wonPo).toBe(draftId);
    expect(c.data.pos.some((p) => p.id === draftId)).toBe(true);
  });

  it("resetStore restores sample portfolio", async () => {
    const reset = await resetStore();
    expect(reset.clients.length).toBe(2);
    expect(reset.clients[0].data.meta.client).toContain("Vento Sul");
  });
});
