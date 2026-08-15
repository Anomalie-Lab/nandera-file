import type {
  ClientData,
  ClosedDeal,
  Negotiation,
  PurchaseOrder,
  Store,
} from "./types";

export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function blankData(name?: string): ClientData {
  return {
    meta: {
      company: "YOUR LOGO",
      title: "Account Status Report",
      client: name || "New Client",
      accountManager: "Trading Desk",
      period: "",
      issued: "",
      reportNo: "",
      tradeLane: "China → Brazil (BR)",
      preparedBy: "Trading Desk",
      contact: "desk@company.com",
    },
    kpi: { activeFoot: "vs. last month", transitFoot: "upcoming arrivals" },
    pos: [],
    neg: [],
    act: [],
    closed: [],
  };
}

/** Same normalize() as the HTML prototype — upgrades legacy records. */
export function normalize(d: ClientData): ClientData {
  d.meta = d.meta || ({} as ClientData["meta"]);
  d.kpi = d.kpi || ({} as ClientData["kpi"]);
  (["pos", "neg", "act", "closed"] as const).forEach((k) => {
    if (!d[k]) {
      d[k] = [] as never;
    }
  });

  d.pos.forEach((p: PurchaseOrder) => {
    if (p.insp === undefined) {
      const q = p.qc || "pending";
      p.insp =
        q === "passed" ? "Passed" : q === "pending" ? "Pending" : "Booked";
      p.inspDate =
        p.insp === "Booked" && p.qcLabel
          ? String(p.qcLabel)
              .replace(/^[A-Za-z ]*/, "")
              .trim()
          : "";
    }
    if (p.inspDate === undefined) p.inspDate = "";
    if (p.ndr === undefined) p.ndr = "";
    if (p.stage === "Booked/Loaded") p.stage = "Loaded";
    if (p.stage === "Delivered / Closed") p.stage = "Arrived";
    delete p.qc;
    delete p.qcLabel;
  });

  d.neg.forEach((n: Negotiation) => {
    if (n.outcome === undefined) n.outcome = "Open";
    if (n.samples === undefined) n.samples = "N/A";
    if (n.stage === "Quotation") n.stage = "Inquiry";
    if (n.stage === "Negotiation") n.stage = "Proposal";
  });

  d.closed.forEach((c: ClosedDeal) => {
    if (c.value == null) c.value = 0;
    if (c.ndr === undefined) c.ndr = "";
  });

  return d;
}

/** Same migrateStore() as the HTML prototype. */
export function migrateStore(obj: unknown): Store | null {
  if (!obj || typeof obj !== "object") return null;
  const raw = obj as Record<string, unknown>;

  if (Array.isArray(raw.clients)) {
    const store = raw as unknown as Store;
    if (store.logo === undefined) store.logo = null;
    if (!store.settings) store.settings = { deliveredMode: "Hidden" };
    if (!store.settings.deliveredMode) store.settings.deliveredMode = "Hidden";
    store.clients.forEach((c) => {
      c.id = c.id || uid();
      normalize(c.data);
    });
    if (!store.clients.find((c) => c.id === store.activeClientId)) {
      store.activeClientId = store.clients[0]?.id ?? "";
    }
    return store;
  }

  if (Array.isArray(raw.pos)) {
    return {
      activeClientId: "m",
      clients: [{ id: "m", data: normalize(raw as unknown as ClientData) }],
      logo: null,
      settings: { deliveredMode: "Hidden" },
    };
  }

  return null;
}
