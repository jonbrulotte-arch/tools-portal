import { describe, expect, it } from "vitest";
import { filterChoices, priceChoices, summarizeChoices, type ChoicePackage } from "@/lib/shipping/carrier-choice";

const pkg = (p: Partial<ChoicePackage>): ChoicePackage => ({
  tracking: "T",
  carrier: "UPS",
  service: "GROUND_RES",
  origin: "LV",
  zone: 5,
  actualWeight: 0.6,
  billedWeight: 1,
  cost: 14,
  shippedAt: null,
  po: null,
  so: null,
  marketplace: null,
  channel: null,
  reference: null,
  shipRef: null,
  destCompany: null,
  destState: null,
  ...p,
});

const chart = [
  { service: "GROUND_RES", origin: "LV", zone: 5, weight: 1, amount: 10 },
  { service: "GROUND_COM", origin: "LV", zone: 5, weight: 1, amount: 8 },
  { service: "GROUND_RES", origin: "LV", zone: 5, weight: 20, amount: 20 },
  { service: "GROUND_COM", origin: "LV", zone: 5, weight: 20, amount: 16 },
  { service: "GROUND_ADVANTAGE", origin: "LV", zone: 5, weight: 0.75, amount: 6 },
  { service: "GROUND_ADVANTAGE", origin: "LV", zone: 5, weight: 20, amount: 30 },
];
const mix = { resShare: { LV: 0.5 }, upsUplift: { LV: 0.1 }, upsUpliftByBand: { LV: [0.2, 0.1, 0.1, 0.1, 0.1, 0] } };

describe("carrier choice", () => {
  it("prices a UPS package on its own service and weight, and USPS at its actual weight", () => {
    const [r] = priceChoices([pkg({ po: "PO1" })], chart, mix);
    // UPS residential 1 lb $10 × (1 + 20% for the under-1-lb band); USPS 0.6 lb → 12 oz tier $6
    expect(r).toMatchObject({ upsQuote: 12, uspsQuote: 6, cheaper: "USPS", extra: 6, band: 0, noOrderLink: false });
  });

  it("blends UPS home and business prices for a USPS package, and counts nothing extra when USPS was cheaper", () => {
    const [cheap, dear] = priceChoices(
      [pkg({ carrier: "USPS", service: "GROUND_ADVANTAGE", actualWeight: 0.6, billedWeight: 0.75 }), pkg({ carrier: "USPS", service: "GROUND_ADVANTAGE", actualWeight: 19.5, billedWeight: 20 })],
      chart,
      mix,
    );
    expect(cheap).toMatchObject({ upsQuote: 10.8, uspsQuote: 6, cheaper: "USPS", extra: 0 }); // (10 + 8) / 2 × 1.2
    expect(dear).toMatchObject({ upsQuote: 19.8, uspsQuote: 30, cheaper: "UPS", extra: 10.2, band: 3 }); // (20 + 16) / 2 × 1.1
  });

  it("leaves packages without both quotes unpriced", () => {
    const [r] = priceChoices([pkg({ zone: 7 })], chart, mix);
    expect(r).toMatchObject({ upsQuote: null, uspsQuote: null, extra: null, cheaper: null });
  });

  it("filters and totals the packages on the more expensive carrier", () => {
    const rows = priceChoices(
      [pkg({ tracking: "A", channel: "LOWES-SMP", po: "PO1" }), pkg({ tracking: "B", cost: 15 }), pkg({ tracking: "C", carrier: "USPS", service: "GROUND_ADVANTAGE", billedWeight: 0.75 }), pkg({ tracking: "D", zone: 7 })],
      chart,
      mix,
    );
    expect(filterChoices(rows, {}).map((r) => r.tracking)).toEqual(["A", "B"]);
    expect(filterChoices(rows, { all: true })).toHaveLength(4);
    expect(filterChoices(rows, { noOrderLink: true, carrier: "UPS", maxLb: 3 }).map((r) => r.tracking)).toEqual(["B"]);
    expect(filterChoices(rows, { channel: "LOWES-SMP" }).map((r) => r.tracking)).toEqual(["A"]);
    expect(filterChoices(rows, { q: "po1" }).map((r) => r.tracking)).toEqual(["A"]);
    const s = summarizeChoices(filterChoices(rows, { all: true }));
    expect(s.totals).toEqual({ packages: 4, paid: 57, extra: 12, moreExpensive: 2, unpriced: 1 });
    expect(s.byChannel.map((g) => [g.key, g.extra])).toEqual([["(none)", 6], ["LOWES-SMP", 6]]);
  });
});
