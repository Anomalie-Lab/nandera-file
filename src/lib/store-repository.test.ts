import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { wipeDb } from "@/test/wipe-db";
import {
  importClientFromExcel,
  loadStore,
  resetStore,
  saveStore,
  scopeStoreForClient,
} from "@/lib/store-repository";
import { seedStore } from "@/lib/domain/seed";
import { computeClientKpis } from "@/lib/domain/business";
import { blankData, uid } from "@/lib/domain/normalize";
import { buildClientWorkbook } from "@/lib/excel-client";

describe("store repository (SQLite)", () => {
  beforeAll(async () => {
    await wipeDb();
  });

  afterAll(async () => {
    await wipeDb();
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

  it("creates a name-based portal user and lastModified for each client", async () => {
    const loaded = await loadStore({ includeAccess: true });
    expect(loaded.clients.length).toBeGreaterThan(0);
    for (const c of loaded.clients) {
      expect(c.lastModified).toBeTruthy();
      expect(c.access?.user).toBeTruthy();
      expect(c.access?.user.includes("@")).toBe(false);
      expect(c.access?.password?.length).toBeGreaterThanOrEqual(8);
    }
    const vento = loaded.clients.find((c) =>
      c.data.meta.client.includes("Vento Sul")
    );
    const andes = loaded.clients.find((c) =>
      c.data.meta.client.includes("Andes")
    );
    expect(vento?.access?.user).toBe("vento.sul");
    expect(andes?.access?.user).toBe("andes.importacoes");
    const users = await prisma.user.findMany({ where: { role: "CLIENT" } });
    expect(users.length).toBe(loaded.clients.length);
    expect(users.every((u: { email: string }) => !u.email.includes("@"))).toBe(
      true
    );
  });

  it("hides portal credentials unless includeAccess is set", async () => {
    const hidden = await loadStore();
    expect(hidden.clients.every((c) => !c.access)).toBe(true);
    const shown = await loadStore({ includeAccess: true });
    expect(shown.clients.every((c) => c.access?.user)).toBe(true);
  });

  it("keeps lastModified when data is unchanged", async () => {
    const first = await loadStore({ includeAccess: true });
    const id = first.clients[0].id;
    const stamp = first.clients[0].lastModified;
    await saveStore(first);
    const again = await loadStore();
    const c = again.clients.find((x) => x.id === id)!;
    expect(c.lastModified).toBe(stamp);
  });

  it("bumps lastModified when client data changes", async () => {
    const first = await loadStore();
    const id = first.clients[0].id;
    const stamp = first.clients[0].lastModified;
    first.clients[0].data.meta.period = `changed-${Date.now()}`;
    await new Promise((r) => setTimeout(r, 20));
    await saveStore(first);
    const again = await loadStore();
    const c = again.clients.find((x) => x.id === id)!;
    expect(c.lastModified).not.toBe(stamp);
  });

  it("preserves the portal username and password across saves", async () => {
    const first = await loadStore({ includeAccess: true });
    const id = first.clients[0].id;
    const creds = first.clients[0].access!;
    first.clients[0].data.meta.period = `keep-creds-${Date.now()}`;
    await saveStore(first);
    const again = await loadStore({ includeAccess: true });
    const c = again.clients.find((x) => x.id === id)!;
    expect(c.access?.user).toBe(creds.user);
    expect(c.access?.password).toBe(creds.password);
  });

  it("creates a portal user from the name when a new client is added", async () => {
    const store = await loadStore({ includeAccess: true });
    const id = uid();
    store.clients.push({
      id,
      data: blankData("Casa do Café Ltda"),
    });
    await saveStore(store);
    const loaded = await loadStore({ includeAccess: true });
    const neu = loaded.clients.find((c) => c.id === id);
    expect(neu?.data.meta.client).toBe("Casa do Café Ltda");
    expect(neu?.access?.user).toBe("casa.cafe");
    expect(neu?.access?.user.includes("@")).toBe(false);
    expect(neu?.access?.password?.length).toBeGreaterThanOrEqual(8);
  });

  it("migrates a leftover email-format client login on load", async () => {
    const store = await loadStore();
    const client = store.clients[0];
    await prisma.user.update({
      where: { clientId: client.id },
      data: { email: "legacy.user@client.nandera.com" },
    });
    const loaded = await loadStore({ includeAccess: true });
    const rec = loaded.clients.find((c) => c.id === client.id);
    expect(rec?.access?.user).toBe("legacy.user");
    expect(rec?.access?.user.includes("@")).toBe(false);
  });

  it("scopeStoreForClient keeps only that client and strips access", async () => {
    const store = await loadStore({ includeAccess: true });
    expect(store.clients.length).toBeGreaterThan(1);
    const target = store.clients[1];
    const scoped = scopeStoreForClient(store, target.id);
    expect(scoped.clients).toHaveLength(1);
    expect(scoped.clients[0].id).toBe(target.id);
    expect(scoped.activeClientId).toBe(target.id);
    expect(scoped.clients[0].access).toBeUndefined();
  });

  it("importClientFromExcel adds a new client without replacing the others", async () => {
    await resetStore();
    const before = await loadStore();
    const names = before.clients.map((c) => c.data.meta.client);

    const incoming = blankData("Mata Atlântica Pack Ltda.");
    incoming.meta.period = "August 2026";
    incoming.pos = [
      {
        id: "tmp",
        code: "PO-2026-0401",
        ndr: "NDR-2801",
        product: "Bagasse trays",
        qty: "1×40′HC",
        value: 33500,
        incoterm: "FOB Ningbo",
        prod: 10,
        insp: "Pending",
        inspDate: "",
        cargoReady: "15 Sep",
        eta: "20 Oct",
        port: "Santos",
        stage: "Confirmed",
      },
    ];
    const xlsx = await buildClientWorkbook(incoming);
    const { store, clientName } = await importClientFromExcel(xlsx);

    expect(clientName).toBe("Mata Atlântica Pack Ltda.");
    expect(store.clients.length).toBe(before.clients.length + 1);
    names.forEach((n) => {
      expect(store.clients.some((c) => c.data.meta.client === n)).toBe(true);
    });
    const created = store.clients.find(
      (c) => c.data.meta.client === "Mata Atlântica Pack Ltda."
    )!;
    expect(created).toBeTruthy();
    expect(store.activeClientId).toBe(created.id);
    expect(created.data.pos[0].code).toBe("PO-2026-0401");
    expect(created.data.pos[0].product).toBe("Bagasse trays");
    expect(created.access?.user).toBe("mata.atlantica");
    expect(created.access?.password).toBeTruthy();

    await expect(importClientFromExcel(xlsx)).rejects.toThrow(
      /Já existe um cliente/
    );
  });
});
