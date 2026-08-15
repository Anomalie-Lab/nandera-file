import type { ClientData, Negotiation, PurchaseOrder, Store } from "./types";
import { PROB } from "./types";
import { blankData, uid } from "./normalize";

/** Auto-create draft PO when negotiation is marked Won (once). */
export function makeDraftPO(neg: Negotiation): PurchaseOrder {
  return {
    id: uid(),
    code: "",
    ndr: "",
    product: neg.topic || "Won deal",
    qty: "",
    value: Number(neg.value) || 0,
    incoterm: "",
    prod: 0,
    insp: "Pending",
    inspDate: "",
    cargoReady: "",
    eta: "",
    port: "",
    stage: "Confirmed",
  };
}

export type SetFieldResult = {
  pendingWonAlert: string | null;
};

/**
 * Single write path matching HTML setField().
 * Mutates the active client / store in place.
 */
export function setField(
  store: Store,
  data: ClientData,
  entity: string,
  id: string,
  f: string,
  v: string
): SetFieldResult {
  let pendingWonAlert: string | null = null;

  if (entity === "meta") {
    (data.meta as Record<string, string>)[f] = v;
    return { pendingWonAlert };
  }
  if (entity === "kpi") {
    (data.kpi as Record<string, string>)[f] = v;
    return { pendingWonAlert };
  }
  if (entity === "opt") {
    store.settings = store.settings || { deliveredMode: "Hidden" };
    (store.settings as Record<string, string>)[f] = v;
    return { pendingWonAlert };
  }

  for (const c of store.clients) {
    const L = (c.data as unknown as Record<string, unknown[]>)[entity];
    if (!L) continue;
    const it = L.find((x) => (x as { id: string }).id === id) as
      | Record<string, unknown>
      | undefined;
    if (!it) continue;

    it[f] = f === "value" || f === "prod" ? (v === "" ? "" : Number(v)) : v;

    if (entity === "neg" && f === "outcome" && v === "Won" && !it.wonPo) {
      const npo = makeDraftPO(it as unknown as Negotiation);
      c.data.pos.unshift(npo);
      it.wonPo = npo.id;
      pendingWonAlert = String(it.ref ?? "");
    }
    return { pendingWonAlert };
  }

  return { pendingWonAlert };
}

/** Move PO from active to closed — same as HTML deliverPO(). */
export function deliverPO(
  data: ClientData,
  id: string,
  deliveredDate: string
): boolean {
  const i = data.pos.findIndex((p) => p.id === id);
  if (i < 0) return false;
  const p = data.pos[i];
  data.closed.unshift({
    id: uid(),
    code: p.code,
    ndr: p.ndr || "",
    product: p.product,
    value: Number(p.value) || 0,
    delivered: deliveredDate.trim() || deliveredDate,
    port: p.port,
  });
  data.pos.splice(i, 1);
  return true;
}

export function money(v: number): string {
  v = Number(v) || 0;
  return v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : (v / 1e3).toFixed(1) + "K";
}

export type ClientKpis = {
  openNegCount: number;
  openNegValue: number;
  activePoCount: number;
  openOrderValue: number;
  inProductionCount: number;
  inProductionValue: number;
  cargoReadyCount: number;
  cargoReadyValue: number;
  inTransitCount: number;
  deliveredCount: number;
  closedOrderValue: number;
};

export function computeClientKpis(data: ClientData): ClientKpis {
  const openNegs = data.neg.filter((n) => n.outcome === "Open");
  const count = (stage: string) =>
    data.pos.filter((p) => p.stage === stage).length;
  const sumStage = (stage: string) =>
    data.pos
      .filter((p) => p.stage === stage)
      .reduce((a, p) => a + (Number(p.value) || 0), 0);

  return {
    openNegCount: openNegs.length,
    openNegValue: openNegs.reduce((a, n) => a + (Number(n.value) || 0), 0),
    activePoCount: data.pos.length,
    openOrderValue: data.pos.reduce((a, p) => a + (Number(p.value) || 0), 0),
    inProductionCount: count("In Production"),
    inProductionValue: sumStage("In Production"),
    cargoReadyCount: count("Cargo Ready"),
    cargoReadyValue: sumStage("Cargo Ready"),
    inTransitCount: count("In Transit"),
    deliveredCount: data.closed.length,
    closedOrderValue: data.closed.reduce(
      (a, c) => a + (Number(c.value) || 0),
      0
    ),
  };
}

export type ForecastRow = {
  clientId: string;
  clientName: string;
  realised: number;
  orderbook: number;
  weighted: number;
  projected: number;
};

/** Business forecast — Inquiry 25%, Proposal 70%. */
export function computeForecast(store: Store): {
  rows: ForecastRow[];
  totals: {
    realised: number;
    orderbook: number;
    weighted: number;
    projected: number;
  };
} {
  const rows = store.clients.map((c) => {
    const realised = c.data.closed.reduce(
      (a, z) => a + (Number(z.value) || 0),
      0
    );
    const orderbook = c.data.pos.reduce(
      (a, p) => a + (Number(p.value) || 0),
      0
    );
    const weighted = c.data.neg
      .filter((n) => n.outcome === "Open")
      .reduce(
        (a, n) => a + (Number(n.value) || 0) * (PROB[n.stage] || 0),
        0
      );
    return {
      clientId: c.id,
      clientName: c.data.meta.client,
      realised,
      orderbook,
      weighted,
      projected: realised + orderbook + weighted,
    };
  });

  const realised = rows.reduce((a, r) => a + r.realised, 0);
  const orderbook = rows.reduce((a, r) => a + r.orderbook, 0);
  const weighted = rows.reduce((a, r) => a + r.weighted, 0);

  return {
    rows,
    totals: {
      realised,
      orderbook,
      weighted,
      projected: realised + orderbook + weighted,
    },
  };
}

export function blankClient(name: string): { id: string; data: ClientData } {
  return { id: uid(), data: blankData(name) };
}
