import { prisma } from "./db";
import type { Store } from "./domain/types";
import { migrateStore, normalize, uid } from "./domain/normalize";
import { seedStore } from "./domain/seed";

function num(v: unknown): number {
  if (v === "" || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function intPct(v: unknown): number {
  const n = Math.round(num(v));
  return Math.max(0, Math.min(100, n));
}

/** Load full store JSON shape from relational tables. */
export async function loadStore(): Promise<Store> {
  const state = await prisma.appState.findUnique({ where: { id: 1 } });
  const clients = await prisma.client.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      purchaseOrders: { orderBy: { sortOrder: "asc" } },
      negotiations: { orderBy: { sortOrder: "asc" } },
      actions: { orderBy: { sortOrder: "asc" } },
      closedDeals: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!clients.length) {
    const seeded = seedStore();
    await saveStore(seeded);
    return seeded;
  }

  const store: Store = {
    activeClientId: state?.activeClientId || clients[0].id,
    logo: state?.logo ?? null,
    settings: { deliveredMode: state?.deliveredMode || "Hidden" },
    clients: clients.map((c) => ({
      id: c.id,
      data: normalize({
        meta: {
          company: c.company,
          title: c.title,
          client: c.client,
          accountManager: c.accountManager,
          period: c.period,
          issued: c.issued,
          reportNo: c.reportNo,
          tradeLane: c.tradeLane,
          preparedBy: c.preparedBy,
          contact: c.contact,
        },
        kpi: {
          activeFoot: c.activeFoot,
          transitFoot: c.transitFoot,
        },
        pos: c.purchaseOrders.map((p) => ({
          id: p.id,
          code: p.code,
          ndr: p.ndr,
          product: p.product,
          qty: p.qty,
          value: p.value,
          incoterm: p.incoterm,
          prod: p.prod,
          insp: p.insp,
          inspDate: p.inspDate,
          cargoReady: p.cargoReady,
          eta: p.eta,
          port: p.port,
          stage: p.stage,
        })),
        neg: c.negotiations.map((n) => ({
          id: n.id,
          ref: n.ref,
          topic: n.topic,
          next: n.next,
          owner: n.owner,
          due: n.due,
          value: n.value,
          stage: n.stage,
          outcome: n.outcome,
          samples: n.samples,
          ...(n.wonPo ? { wonPo: n.wonPo } : {}),
        })),
        act: c.actions.map((a) => ({
          id: a.id,
          type: a.type,
          text: a.text,
          owner: a.owner,
        })),
        closed: c.closedDeals.map((d) => ({
          id: d.id,
          code: d.code,
          ndr: d.ndr,
          product: d.product,
          value: d.value,
          delivered: d.delivered,
          port: d.port,
        })),
      }),
    })),
  };

  if (!store.clients.find((c) => c.id === store.activeClientId)) {
    store.activeClientId = store.clients[0].id;
  }

  return store;
}

/** Replace entire DB content with store (transactional). */
export async function saveStore(input: Store): Promise<Store> {
  const migrated = migrateStore(input);
  if (!migrated) throw new Error("Invalid store payload");

  // Ensure ids on nested entities
  migrated.clients.forEach((c) => {
    c.id = c.id || uid();
    (["pos", "neg", "act", "closed"] as const).forEach((k) => {
      c.data[k].forEach((x) => {
        x.id = x.id || uid();
      });
    });
  });

  await prisma.$transaction(async (tx) => {
    await tx.closedDeal.deleteMany();
    await tx.actionItem.deleteMany();
    await tx.negotiation.deleteMany();
    await tx.purchaseOrder.deleteMany();
    await tx.client.deleteMany();

    await tx.appState.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        activeClientId: migrated.activeClientId,
        logo: migrated.logo,
        deliveredMode: migrated.settings?.deliveredMode || "Hidden",
      },
      update: {
        activeClientId: migrated.activeClientId,
        logo: migrated.logo,
        deliveredMode: migrated.settings?.deliveredMode || "Hidden",
      },
    });

    for (const [ci, c] of migrated.clients.entries()) {
      const m = c.data.meta;
      const k = c.data.kpi;
      await tx.client.create({
        data: {
          id: c.id,
          company: m.company || "YOUR LOGO",
          title: m.title || "Account Status Report",
          client: m.client || "Untitled",
          accountManager: m.accountManager || "",
          period: m.period || "",
          issued: m.issued || "",
          reportNo: m.reportNo || "",
          tradeLane: m.tradeLane || "",
          preparedBy: m.preparedBy || "",
          contact: m.contact || "",
          activeFoot: k.activeFoot || "",
          transitFoot: k.transitFoot || "",
          sortOrder: ci,
          purchaseOrders: {
            create: c.data.pos.map((p, i) => ({
              id: p.id,
              code: String(p.code ?? ""),
              ndr: String(p.ndr ?? ""),
              product: String(p.product ?? ""),
              qty: String(p.qty ?? ""),
              value: num(p.value),
              incoterm: String(p.incoterm ?? ""),
              prod: intPct(p.prod),
              insp: String(p.insp || "Pending"),
              inspDate: String(p.inspDate ?? ""),
              cargoReady: String(p.cargoReady ?? ""),
              eta: String(p.eta ?? ""),
              port: String(p.port ?? ""),
              stage: String(p.stage || "Confirmed"),
              sortOrder: i,
            })),
          },
          negotiations: {
            create: c.data.neg.map((n, i) => ({
              id: n.id,
              ref: String(n.ref ?? ""),
              topic: String(n.topic ?? ""),
              next: String(n.next ?? ""),
              owner: String(n.owner ?? ""),
              due: String(n.due ?? ""),
              value: num(n.value),
              stage: String(n.stage || "Inquiry"),
              outcome: String(n.outcome || "Open"),
              samples: String(n.samples || "N/A"),
              wonPo: n.wonPo ? String(n.wonPo) : null,
              sortOrder: i,
            })),
          },
          actions: {
            create: c.data.act.map((a, i) => ({
              id: a.id,
              type: String(a.type || "gold"),
              text: String(a.text ?? ""),
              owner: String(a.owner ?? ""),
              sortOrder: i,
            })),
          },
          closedDeals: {
            create: c.data.closed.map((d, i) => ({
              id: d.id,
              code: String(d.code ?? ""),
              ndr: String(d.ndr ?? ""),
              product: String(d.product ?? ""),
              value: num(d.value),
              delivered: String(d.delivered ?? ""),
              port: String(d.port ?? ""),
              sortOrder: i,
            })),
          },
        },
      });
    }
  });

  return migrated;
}

export async function resetStore(): Promise<Store> {
  const seeded = seedStore();
  return saveStore(seeded);
}
