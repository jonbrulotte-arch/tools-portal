import { describe, expect, it } from "vitest";
import { blendedCost, cellCost, mixFrom, realityCheck, warehouseShare, type ProductRate } from "@/lib/shipping/blended-cost";
import type { ItemInventory } from "@/lib/shipping/mango-inventory";

const origins = [{ code: "LV", name: "Las Vegas, NV" }, { code: "GV", name: "Groveport, OH" }];
// LV: 30 to zone 8, 10 to zone 4; GV: 60 to zone 4. UPS residential share: LV 50%, GV 25%.
const mix = mixFrom(
  [
    { origin: "LV", zone: 8, carrier: "UPS", service: "GROUND_RES", count: 15 },
    { origin: "LV", zone: 8, carrier: "UPS", service: "GROUND_COM", count: 15 },
    { origin: "LV", zone: 4, carrier: "USPS", service: "GROUND_ADVANTAGE", count: 10 },
    { origin: "GV", zone: 4, carrier: "UPS", service: "GROUND_RES", count: 15 },
    { origin: "GV", zone: 4, carrier: "UPS", service: "GROUND_COM", count: 45 },
    { origin: "GV", zone: 1, carrier: "UPS", service: "GROUND_COM", count: 99 }, // zone 1 isn't quoted: ignored
  ],
  { reportId: "r", dateFrom: null, dateTo: null },
);
const inv = (o: Partial<ItemInventory> = {}): ItemInventory => ({ partNumber: "P", description: null, stock: {}, shipments: {}, shipmentCarriers: {}, otherShipments: 0, unitsLastMonth: null, snapshotAt: null, fetchedAt: "2026-11-20T00:00:00Z", error: null, ...o });

describe("mixes from the cost report", () => {
  it("zone mix per warehouse, residential share, warehouse split", () => {
    expect(mix.zoneMix).toEqual({ LV: { 8: 0.75, 4: 0.25 }, GV: { 4: 1 } });
    expect(mix.originSplit).toEqual({ LV: 0.4, GV: 0.6 });
    // LV has too few UPS shipments (30 < 50) → the overall share (30 residential of 90); GV has 60 → its own 25%
    expect(mix.resShare.LV).toBeCloseTo(1 / 3);
    expect(mix.resShare.GV).toBe(0.25);
    expect(mix.shipments).toBe(100);
  });
});

describe("warehouse share", () => {
  it("uses the item's own shipments when there are enough", () => {
    const s = warehouseShare(inv({ shipments: { GV: 11, LV: 3 }, shipmentCarriers: { UPS: 5, USPS: 9 }, stock: { LV: { onHand: 5, allocated: 0 } } }), mix, origins);
    expect(s).toMatchObject({ basis: "shipments", understates: false });
    expect(s.shares.GV).toBeCloseTo(11 / 14);
    expect(s.label).toBe("From 14 shipments last month (9 USPS, 5 UPS): 79% Groveport, OH");
    // USPS-only products now have their own split too
    expect(warehouseShare(inv({ shipments: { LV: 6 }, shipmentCarriers: { USPS: 6 } }), mix, origins)).toMatchObject({ basis: "shipments", shares: { LV: 1 }, label: "From 6 USPS shipments last month: all Las Vegas, NV" });
  });
  it("one warehouse stocked: 100% there, flagged as possibly understated", () => {
    const s = warehouseShare(inv({ stock: { LV: { onHand: 0, allocated: 0 }, GV: { onHand: 1319, allocated: 16 } }, shipments: { GV: 2 } }), mix, origins);
    expect(s).toMatchObject({ shares: { GV: 1 }, basis: "stock-one", understates: true });
    expect(s.label).toMatch(/Stocked in Groveport, OH only .*may understate/);
  });
  it("both stocked, few shipments, no data, and no record fall back sensibly", () => {
    // stocked in both: the warehouse with most of the stock ships it (13017: Groveport 1,283 of 1,763)
    const both = warehouseShare(inv({ stock: { LV: { onHand: 480, allocated: 1 }, GV: { onHand: 1283, allocated: 1 } } }), mix, origins);
    expect(both).toMatchObject({ basis: "stock-both", shares: { GV: 1 }, understates: true });
    expect(both.label).toMatch(/^Stocked in both; ships from Groveport, OH, which has most of the stock \(73%\)/);
    expect(warehouseShare(inv({ stock: { LV: { onHand: 9, allocated: 0 }, GV: { onHand: 9, allocated: 0 } } }), mix, origins)).toMatchObject({ basis: "stock-both", shares: { LV: 0.4, GV: 0.6 } });
    expect(warehouseShare(inv({ shipments: { LV: 2 } }), mix, origins)).toMatchObject({ basis: "few-shipments", shares: { LV: 1 }, label: "From only 2 shipments last month: all Las Vegas, NV" });
    expect(warehouseShare(inv(), mix, origins)).toMatchObject({ basis: "company", label: "No stock or shipment data in Mango: company-wide split" });
    expect(warehouseShare(null, mix, origins)).toMatchObject({ basis: "company", label: "No Mango data yet: company-wide split" });
    expect(warehouseShare(inv({ fetchedAt: null, error: "Mango answered HTTP 500" }), mix, origins).label).toMatch(/No Mango data \(Mango answered HTTP 500\)/);
  });
});

describe("blended cost", () => {
  it("takes the cheaper carrier for home and business addresses", () => {
    expect(cellCost({ usps: 10, com: 8, res: 12 }, 0.25)).toBe(0.25 * 10 + 0.75 * 8);
    expect(cellCost({ usps: null, com: 8, res: 12 }, 0.5)).toBe(10);
    expect(cellCost({ usps: null, com: null, res: 12 }, 0.5)).toBe(12);
    expect(cellCost({ usps: null, com: null, res: null }, 0.5)).toBeNull();
  });

  const rate = (origin: string, zone: number, service: string, amount: number | null): ProductRate => ({ origin, zone, service, amount });
  const rates = [rate("LV", 8, "GROUND_ADVANTAGE", 20), rate("LV", 8, "GROUND_COM", 30), rate("LV", 8, "GROUND_RES", 33), rate("LV", 4, "GROUND_ADVANTAGE", 10), rate("GV", 4, "GROUND_ADVANTAGE", 12), rate("GV", 4, "GROUND_COM", 9), rate("GV", 4, "GROUND_RES", 11)];

  it("weights each warehouse's zone mix by the warehouse share", () => {
    const b = blendedCost(rates, mix, { shares: { LV: 0.4, GV: 0.6 }, basis: "company", label: "", understates: false });
    const gv4 = 0.25 * 11 + 0.75 * 9; // GV has 60 UPS shipments, enough for its own 25% residential share; home min(12,11), business min(12,9)
    expect(b.cost).toBeCloseTo(0.4 * 0.75 * 20 + 0.4 * 0.25 * 10 + 0.6 * gv4, 2);
    expect(b).toMatchObject({ best: Math.round(gv4 * 100) / 100, worst: 20, coverage: 1, incomplete: false });
  });

  it("drops cells with no price, re-weights the rest and flags low coverage", () => {
    const b = blendedCost(rates.filter((r) => r.origin !== "GV"), mix, { shares: { LV: 0.4, GV: 0.6 }, basis: "company", label: "", understates: false });
    expect(b.coverage).toBeCloseTo(0.4);
    expect(b.incomplete).toBe(true);
    expect(b.cost).toBeCloseTo(0.75 * 20 + 0.25 * 10, 2);
    expect(blendedCost([], mix, { shares: { GV: 1 }, basis: "stock-one", label: "", understates: true })).toMatchObject({ cost: null, best: null, coverage: 0 });
  });
});

describe("reality check", () => {
  const chart = [
    { service: "GROUND_ADVANTAGE", origin: "LV", zone: 8, weight: 2, amount: 10 },
    { service: "GROUND_ADVANTAGE", origin: "LV", zone: 4, weight: 2, amount: 8 },
    { service: "GROUND_ADVANTAGE", origin: "GV", zone: 4, weight: 2, amount: 8 },
    { service: "GROUND_COM", origin: "GV", zone: 4, weight: 30, amount: 20 },
  ];
  it("compares the model with what was paid, by weight band", () => {
    const history = [
      { carrier: "USPS", service: "GROUND_ADVANTAGE", origin: "LV", zone: 8, weight: 2, count: 30, total: 300 },
      { carrier: "USPS", service: "GROUND_ADVANTAGE", origin: "GV", zone: 4, weight: 2, count: 30, total: 240 },
      { carrier: "UPS", service: "GROUND_COM", origin: "GV", zone: 4, weight: 30, count: 5, total: 100 },
    ];
    const r = realityCheck(history, chart, mix);
    const b15 = r.bands.find((b) => b.label === "1–5 lb")!;
    // model at 2 lb: LV 0.4×(0.75×10 + 0.25×8) + GV 0.6×8 = 8.6; actual = 540/60 = 9
    expect(b15).toMatchObject({ shipments: 60, actual: 9, model: 8.6, diffPct: -4.4, enough: true });
    expect(r.bands.find((b) => b.label === "20–50 lb")).toMatchObject({ shipments: 5, enough: false, diffPct: null }); // too few to judge
    expect(r).toMatchObject({ overallPct: 4.4, reliable: true });
  });
});
