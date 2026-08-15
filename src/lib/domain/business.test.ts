import { describe, expect, it } from "vitest";
import { migrateStore, normalize, blankData, uid } from "@/lib/domain/normalize";
import {
  computeClientKpis,
  computeForecast,
  deliverPO,
  makeDraftPO,
  money,
  setField,
} from "@/lib/domain/business";
import { seedStore } from "@/lib/domain/seed";
import { storeSchema } from "@/lib/validation";
import type { ClientData, Store } from "@/lib/domain/types";

describe("normalize / migrateStore", () => {
  it("upgrades legacy qc fields on POs", () => {
    const d = blankData("Test");
    d.pos.push({
      id: uid(),
      code: "PO-1",
      ndr: "",
      product: "X",
      qty: "1",
      value: 10,
      incoterm: "",
      prod: 0,
      insp: undefined as unknown as string,
      inspDate: undefined as unknown as string,
      cargoReady: "",
      eta: "",
      port: "",
      stage: "Booked/Loaded",
      qc: "passed",
    });
    normalize(d);
    expect(d.pos[0].insp).toBe("Passed");
    expect(d.pos[0].stage).toBe("Loaded");
    expect(d.pos[0].qc).toBeUndefined();
  });

  it("maps Quotation→Inquiry and Negotiation→Proposal", () => {
    const d = blankData("Test");
    d.neg.push({
      id: uid(),
      ref: "N1",
      topic: "t",
      next: "",
      owner: "",
      due: "",
      value: 1,
      stage: "Quotation",
      outcome: undefined as unknown as string,
      samples: undefined as unknown as string,
    });
    d.neg.push({
      id: uid(),
      ref: "N2",
      topic: "t2",
      next: "",
      owner: "",
      due: "",
      value: 1,
      stage: "Negotiation",
      outcome: "Open",
      samples: "N/A",
    });
    normalize(d);
    expect(d.neg[0].stage).toBe("Inquiry");
    expect(d.neg[0].outcome).toBe("Open");
    expect(d.neg[0].samples).toBe("N/A");
    expect(d.neg[1].stage).toBe("Proposal");
  });

  it("migrates legacy single-client backup shape", () => {
    const legacy = blankData("Solo");
    legacy.pos.push({
      id: "a",
      code: "PO",
      ndr: "",
      product: "p",
      qty: "1",
      value: 5,
      incoterm: "",
      prod: 0,
      insp: "Pending",
      inspDate: "",
      cargoReady: "",
      eta: "",
      port: "",
      stage: "Confirmed",
    });
    const store = migrateStore(legacy);
    expect(store).not.toBeNull();
    expect(store!.clients).toHaveLength(1);
    expect(store!.settings.deliveredMode).toBe("Hidden");
    expect(store!.logo).toBeNull();
  });

  it("returns null for invalid payloads", () => {
    expect(migrateStore(null)).toBeNull();
    expect(migrateStore({})).toBeNull();
    expect(migrateStore("x")).toBeNull();
  });
});

describe("KPIs", () => {
  it("computes auto KPIs matching business rules", () => {
    const store = seedStore();
    const vento = store.clients[0].data;
    const k = computeClientKpis(vento);

    expect(k.activePoCount).toBe(vento.pos.length);
    expect(k.deliveredCount).toBe(vento.closed.length);
    expect(k.openNegCount).toBe(
      vento.neg.filter((n) => n.outcome === "Open").length
    );
    expect(k.openOrderValue).toBe(
      vento.pos.reduce((a, p) => a + Number(p.value), 0)
    );
    expect(k.closedOrderValue).toBe(
      vento.closed.reduce((a, c) => a + Number(c.value), 0)
    );
    expect(k.inProductionCount).toBe(
      vento.pos.filter((p) => p.stage === "In Production").length
    );
    expect(k.inTransitCount).toBe(
      vento.pos.filter((p) => p.stage === "In Transit").length
    );
    // Won/Lost must not count in open negotiation value
    const openVal = vento.neg
      .filter((n) => n.outcome === "Open")
      .reduce((a, n) => a + Number(n.value), 0);
    expect(k.openNegValue).toBe(openVal);
  });

  it("formats money like the HTML helper", () => {
    expect(money(98900)).toBe("98.9K");
    expect(money(1_200_000)).toBe("1.20M");
    expect(money(0)).toBe("0.0K");
  });
});

describe("Won → draft PO automation", () => {
  it("creates one draft PO and sets wonPo flag", () => {
    const store = seedStore();
    const data = store.clients[0].data;
    const neg = data.neg.find((n) => n.outcome === "Open" && n.ref === "NEG-04")!;
    const before = data.pos.length;

    const r1 = setField(store, data, "neg", neg.id, "outcome", "Won");
    expect(r1.pendingWonAlert).toBe("NEG-04");
    expect(data.pos.length).toBe(before + 1);
    expect(data.pos[0].product).toBe(neg.topic);
    expect(Number(data.pos[0].value)).toBe(Number(neg.value));
    expect(data.pos[0].code).toBe("");
    expect(data.pos[0].stage).toBe("Confirmed");
    expect(neg.wonPo).toBe(data.pos[0].id);

    // Second Won must not duplicate
    const r2 = setField(store, data, "neg", neg.id, "outcome", "Won");
    expect(r2.pendingWonAlert).toBeNull();
    expect(data.pos.length).toBe(before + 1);
  });

  it("makeDraftPO pre-fills product and value", () => {
    const draft = makeDraftPO({
      id: "x",
      ref: "NEG",
      topic: "Widgets",
      next: "",
      owner: "",
      due: "",
      value: 42_000,
      stage: "Proposal",
      outcome: "Won",
      samples: "N/A",
    });
    expect(draft.product).toBe("Widgets");
    expect(draft.value).toBe(42000);
    expect(draft.insp).toBe("Pending");
  });
});

describe("Deliver → Closed", () => {
  it("moves PO to closed with carried fields", () => {
    const data = seedStore().clients[0].data;
    const po = data.pos[0];
    const id = po.id;
    const beforePos = data.pos.length;
    const beforeClosed = data.closed.length;

    expect(deliverPO(data, id, "14 Aug 2026")).toBe(true);
    expect(data.pos.find((p) => p.id === id)).toBeUndefined();
    expect(data.pos.length).toBe(beforePos - 1);
    expect(data.closed.length).toBe(beforeClosed + 1);
    expect(data.closed[0].code).toBe(po.code);
    expect(data.closed[0].ndr).toBe(po.ndr);
    expect(data.closed[0].product).toBe(po.product);
    expect(Number(data.closed[0].value)).toBe(Number(po.value));
    expect(data.closed[0].port).toBe(po.port);
    expect(data.closed[0].delivered).toBe("14 Aug 2026");
  });

  it("returns false for unknown id", () => {
    const data = seedStore().clients[0].data;
    expect(deliverPO(data, "missing", "x")).toBe(false);
  });
});

describe("Business forecast", () => {
  it("applies Inquiry 25% and Proposal 70%", () => {
    const store: Store = {
      activeClientId: "1",
      logo: null,
      settings: { deliveredMode: "Hidden" },
      clients: [
        {
          id: "1",
          data: {
            ...blankData("A"),
            pos: [
              {
                id: "p1",
                code: "PO",
                ndr: "",
                product: "p",
                qty: "",
                value: 1000,
                incoterm: "",
                prod: 0,
                insp: "Pending",
                inspDate: "",
                cargoReady: "",
                eta: "",
                port: "",
                stage: "Confirmed",
              },
            ],
            neg: [
              {
                id: "n1",
                ref: "N1",
                topic: "i",
                next: "",
                owner: "",
                due: "",
                value: 1000,
                stage: "Inquiry",
                outcome: "Open",
                samples: "N/A",
              },
              {
                id: "n2",
                ref: "N2",
                topic: "p",
                next: "",
                owner: "",
                due: "",
                value: 1000,
                stage: "Proposal",
                outcome: "Open",
                samples: "N/A",
              },
              {
                id: "n3",
                ref: "N3",
                topic: "w",
                next: "",
                owner: "",
                due: "",
                value: 9999,
                stage: "Proposal",
                outcome: "Won",
                samples: "N/A",
              },
            ],
            closed: [
              {
                id: "c1",
                code: "C",
                ndr: "",
                product: "x",
                value: 500,
                delivered: "",
                port: "",
              },
            ],
            act: [],
          },
        },
      ],
    };

    const fc = computeForecast(store);
    expect(fc.rows[0].realised).toBe(500);
    expect(fc.rows[0].orderbook).toBe(1000);
    expect(fc.rows[0].weighted).toBe(1000 * 0.25 + 1000 * 0.7);
    expect(fc.rows[0].projected).toBe(500 + 1000 + 250 + 700);
    expect(fc.totals.projected).toBe(fc.rows[0].projected);
  });
});

describe("storeSchema validation (security)", () => {
  it("accepts seeded store", () => {
    const store = seedStore();
    const parsed = storeSchema.safeParse(store);
    expect(parsed.success).toBe(true);
  });

  it("rejects empty clients", () => {
    const store = seedStore();
    store.clients = [];
    expect(storeSchema.safeParse(store).success).toBe(false);
  });

  it("rejects invalid deliveredMode", () => {
    const store = seedStore();
    store.settings.deliveredMode = "Nope";
    expect(storeSchema.safeParse(store).success).toBe(false);
  });

  it("rejects invalid PO stage", () => {
    const store = seedStore();
    store.clients[0].data.pos[0].stage = "Flying";
    expect(storeSchema.safeParse(store).success).toBe(false);
  });

  it("rejects non-image logo payloads", () => {
    const store = seedStore();
    store.logo = "javascript:alert(1)";
    expect(storeSchema.safeParse(store).success).toBe(false);
  });
});

describe("setField meta/kpi/opt", () => {
  it("updates meta, kpi and settings", () => {
    const store = seedStore();
    const data = store.clients[0].data as ClientData;
    setField(store, data, "meta", "_", "client", "Renamed Co");
    expect(data.meta.client).toBe("Renamed Co");
    setField(store, data, "kpi", "_", "activeFoot", "▲ 1");
    expect(data.kpi.activeFoot).toBe("▲ 1");
    setField(store, data, "opt", "_", "deliveredMode", "Listed");
    expect(store.settings.deliveredMode).toBe("Listed");
  });
});
