import { prisma } from "./db";
import type { ClientData, ClientRecord, Store } from "./domain/types";
import { migrateStore, normalize, uid } from "./domain/normalize";
import { seedStore } from "./domain/seed";
import {
  ExcelImportError,
  parseClientWorkbook,
} from "./excel-client";
import {
  migrateClientUsernames,
  restoreOrCreateClientUser,
  snapshotClientUsers,
  usedLoginsSet,
  type ClientUserSnap,
} from "./users";

function num(v: unknown): number {
  if (v === "" || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function intPct(v: unknown): number {
  const n = Math.round(num(v));
  return Math.max(0, Math.min(100, n));
}

export function fingerprintClientData(data: ClientData): string {
  const d = normalize(structuredClone(data));
  d.neg.forEach((n) => {
    if (!n.wonPo) delete n.wonPo;
  });
  return JSON.stringify(d);
}

type DbClient = Awaited<ReturnType<typeof prisma.client.findMany>>[number] & {
  purchaseOrders: Awaited<ReturnType<typeof prisma.purchaseOrder.findMany>>;
  negotiations: Awaited<ReturnType<typeof prisma.negotiation.findMany>>;
  actions: Awaited<ReturnType<typeof prisma.actionItem.findMany>>;
  closedDeals: Awaited<ReturnType<typeof prisma.closedDeal.findMany>>;
  portalUser?: {
    email: string;
    passwordPlain: string | null;
  } | null;
};

function toClientData(c: DbClient): ClientData {
  return normalize({
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
      logo: c.logo ?? null,
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
  });
}

function toClientRecord(
  c: DbClient,
  includeAccess: boolean
): ClientRecord {
  const record: ClientRecord = {
    id: c.id,
    data: toClientData(c),
    lastModified: c.lastModified.toISOString(),
  };
  if (includeAccess && c.portalUser) {
    record.access = {
      user: c.portalUser.email,
      password: c.portalUser.passwordPlain || "",
    };
  }
  return record;
}

const clientInclude = {
  purchaseOrders: { orderBy: { sortOrder: "asc" as const } },
  negotiations: { orderBy: { sortOrder: "asc" as const } },
  actions: { orderBy: { sortOrder: "asc" as const } },
  closedDeals: { orderBy: { sortOrder: "asc" as const } },
  portalUser: {
    select: { email: true, passwordPlain: true, role: true },
  },
};

/** Load full store JSON shape from relational tables. */
export async function loadStore(opts?: {
  includeAccess?: boolean;
}): Promise<Store> {
  await migrateClientUsernames(prisma);
  const includeAccess = Boolean(opts?.includeAccess);
  const state = await prisma.appState.findUnique({ where: { id: 1 } });
  const clients = await prisma.client.findMany({
    orderBy: { sortOrder: "asc" },
    include: clientInclude,
  });

  if (!clients.length) {
    const seeded = seedStore();
    await saveStore(seeded);
    return loadStore(opts);
  }

  const store: Store = {
    activeClientId: state?.activeClientId || clients[0].id,
    logo: state?.logo ?? null,
    settings: { deliveredMode: state?.deliveredMode || "Hidden" },
    clients: clients.map((c) => toClientRecord(c as DbClient, includeAccess)),
  };

  if (!store.clients.find((c) => c.id === store.activeClientId)) {
    store.activeClientId = store.clients[0].id;
  }

  return store;
}

/** Replace entire DB content with store (transactional). */
export async function saveStore(
  input: Store,
  opts?: { assignSellerIdForNewClients?: string }
): Promise<Store> {
  const migrated = migrateStore(input);
  if (!migrated) throw new Error("Invalid store payload");

  migrated.clients.forEach((c) => {
    c.id = c.id || uid();
    (["pos", "neg", "act", "closed"] as const).forEach((k) => {
      c.data[k].forEach((x) => {
        x.id = x.id || uid();
      });
    });
  });

  const previous = await prisma.client.findMany({
    include: clientInclude,
  });
  const prevById = new Map(
    previous.map((c) => [
      c.id,
      {
        lastModified: c.lastModified,
        fingerprint: fingerprintClientData(toClientData(c as DbClient)),
        sellerId: c.sellerId,
      },
    ])
  );

  const snaps = await snapshotClientUsers(prisma);
  const snapMap = new Map(snaps.map((s) => [s.clientId, s]));

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

    const now = new Date();
    const usedLogins = await usedLoginsSet(tx);

    for (const [ci, c] of migrated.clients.entries()) {
      const m = c.data.meta;
      const k = c.data.kpi;
      const fp = fingerprintClientData(c.data);
      const prev = prevById.get(c.id);
      const lastModified =
        prev && prev.fingerprint === fp ? prev.lastModified : now;

      await tx.client.create({
        data: {
          id: c.id,
          company: m.company || "YOUR LOGO",
          logo: m.logo ?? null,
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
          lastModified,
          sellerId: prev
            ? prev.sellerId
            : opts?.assignSellerIdForNewClients ?? null,
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

      await restoreOrCreateClientUser(
        tx,
        c.id,
        m.client || "Untitled",
        snapMap,
        usedLogins
      );
    }
  });

  return loadStore({ includeAccess: true });
}

export async function resetStore(): Promise<Store> {
  const seeded = seedStore();
  return saveStore(seeded);
}

/** Create one new client from the official Excel template. Does not replace existing clients. */
export async function importClientFromExcel(buffer: Buffer): Promise<{
  store: Store;
  clientName: string;
}> {
  const data = await parseClientWorkbook(buffer);
  const name = data.meta.client.trim();
  const store = await loadStore({ includeAccess: true });
  const dup = store.clients.find(
    (c) => c.data.meta.client.trim().toLowerCase() === name.toLowerCase()
  );
  if (dup) {
    throw new ExcelImportError(
      `Já existe um cliente chamado "${name}". Renomeie na planilha ou edite o registro atual.`
    );
  }

  const id = uid();
  store.clients.push({ id, data });
  store.activeClientId = id;
  const saved = await saveStore(store);
  return { store: saved, clientName: name };
}

export function scopeStoreForClient(store: Store, clientId: string): Store {
  const mine = store.clients.filter((c) => c.id === clientId);
  return {
    ...store,
    activeClientId: mine[0]?.id || clientId,
    clients: mine.map((c) => {
      const copy = { ...c };
      delete copy.access;
      return copy;
    }),
  };
}

export function scopeStoreForSeller(
  store: Store,
  allowedClientIds: string[]
): Store {
  const allowed = new Set(allowedClientIds);
  const mine = store.clients.filter((c) => allowed.has(c.id));
  return {
    ...store,
    activeClientId: mine.some((c) => c.id === store.activeClientId)
      ? store.activeClientId
      : mine[0]?.id || "",
    clients: mine,
  };
}

/**
 * Seller save: merge assigned clients; allow creating new ones (auto-assigned).
 * Prevents wiping/editing other sellers' clients (saveStore replaces all rows).
 * Sellers cannot delete clients — the global set is kept, only new ids are appended.
 * At most one new client per save (blocks accidental seed/sample dumps).
 */
export async function saveStoreForSeller(
  input: Store,
  allowedClientIds: string[],
  sellerUserId: string
): Promise<Store> {
  const allowed = new Set(allowedClientIds);
  const migrated = migrateStore(input);
  if (!migrated) throw new Error("Invalid store payload");

  const full = await loadStore({ includeAccess: true });
  const existingIds = new Set(full.clients.map((c) => c.id));

  /** Ignore unassigned existing clients (stale UI must not block saves). */
  let sellerClients = migrated.clients.filter(
    (c) => allowed.has(c.id) || !existingIds.has(c.id)
  );

  let created = sellerClients.filter((c) => !existingIds.has(c.id));
  if (created.length > 1) {
    const pick =
      created.find((c) => c.id === migrated.activeClientId) ?? created[0];
    sellerClients = sellerClients.filter(
      (c) => existingIds.has(c.id) || c.id === pick.id
    );
    created = created.filter((c) => c.id === pick.id);
  }
  for (const c of created) {
    const name = (c.data.meta.client || "").trim().toLowerCase();
    if (
      name &&
      full.clients.some(
        (x) => x.data.meta.client.trim().toLowerCase() === name
      )
    ) {
      throw new Error(
        `Forbidden: a client named "${c.data.meta.client.trim()}" already exists.`
      );
    }
  }

  const byId = new Map(full.clients.map((c) => [c.id, c]));
  for (const c of sellerClients) {
    if (allowed.has(c.id) || !existingIds.has(c.id)) {
      byId.set(c.id, c);
    }
  }

  const createdIds = new Set(created.map((c) => c.id));
  const merged: Store = {
    ...full,
    activeClientId:
      allowed.has(migrated.activeClientId) ||
      createdIds.has(migrated.activeClientId)
        ? migrated.activeClientId
        : full.activeClientId,
    logo: migrated.logo ?? full.logo,
    settings: migrated.settings || full.settings,
    clients: [
      ...full.clients.map((c) => byId.get(c.id) || c),
      ...created,
    ],
  };

  return saveStore(merged, { assignSellerIdForNewClients: sellerUserId });
}
