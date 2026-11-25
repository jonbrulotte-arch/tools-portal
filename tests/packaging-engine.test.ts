import { describe, expect, it } from "vitest";
import { analyzeShipment, foldedProduct, packIn, rankPackaging, rateFor, roundWeight, shippingFor, standaloneResult, type Packaging, type Product, type ShippingMethod } from "@/lib/packaging/engine";
import { analyzeCatalog } from "@/lib/packaging/report";

const s = { dimDivisor: 139, packEfficiency: 0.7, ltlThreshold: 150, fitClearance: 0.5 };
const prod = (o: Partial<Product> & { partNumber: string }): Product => ({ name: o.partNumber, height: 5, width: 7, length: 9, weight: 2, foldable: false, shipsOwn: false, ...o });
const box: Packaging = { id: "box", name: "Box 10x8x6", type: "box", height: 6, width: 8, length: 10, maxHeight: null, maxWeight: 20, tareWeight: 0.5 };
const mailer: Packaging = { id: "mailer", name: "Bubble 6x9", type: "bubble_mailer", height: 0.25, width: 6, length: 9, maxHeight: 1, maxWeight: 2, tareWeight: 0.1 };
const ups: ShippingMethod = { id: "ups", name: "UPS Ground", minWeight: 0, maxWeight: 150, dimDivisor: null, dimThreshold: null, isLtl: false, rates: [{ maxWeight: 5, rate: 10 }] };
const usps: ShippingMethod = { id: "usps", name: "USPS Ground Advantage", minWeight: 0, maxWeight: 70, dimDivisor: 166, dimThreshold: 1728, isLtl: false, rates: [{ maxWeight: 5, rate: 7 }, { maxWeight: 2, rate: 5 }] };
const ltl: ShippingMethod = { id: "ltl", name: "LTL", minWeight: 150, maxWeight: null, dimDivisor: null, dimThreshold: null, isLtl: true, rates: [{ maxWeight: 500, rate: 120 }] };

describe("weights and rates", () => {
  it("rounds the carrier way and finds the rate break", () => {
    expect([0.2524, 1, 1.01, 3.453, 4].map(roundWeight)).toEqual([0.252, 1, 2, 4, 4]);
    expect(rateFor(usps.rates, 1.5)).toEqual({ rate: 5, rateBreak: 2 }); // breaks are sorted first
    expect(rateFor(usps.rates, 6)).toBeNull();
  });

  it("bills DIM per method: divisor override, and no DIM under a method's threshold", () => {
    const m = shippingFor(480, 2.5, 139, [ups, usps]);
    expect(m[0]).toMatchObject({ methodId: "ups", dimWeight: 4, billedWeight: 4, dimApplied: true, rate: 10, rateBreak: 5 });
    // USPS: 480 in³ is under its 1,728 threshold → actual 2.5 → 3 lb
    expect(m[1]).toMatchObject({ methodId: "usps", billedWeight: 3, dimApplied: false, rate: 7 });
  });
});

describe("packing one shipment", () => {
  it("fits a product in a box with clearance and scores it", () => {
    const r = packIn([{ product: prod({ partNumber: "A" }), quantity: 1 }], box, s, [ups, usps])!;
    // 315 in³ in a 480 in³ box
    // billed: the lowest of the methods (USPS bills its actual 2.5 → 3 lb; UPS bills 4 lb by DIM)
    expect(r).toMatchObject({ volumeUtilization: 65.6, fitQuality: "good", productsWeight: 2, packagingWeight: 0.5, actualWeight: 2.5, dimWeight: 4, billedWeight: 3, overweight: false });
    expect(r.dimFlag).toBe(false); // USPS bills it by actual weight
    expect(r.shippedDims).toEqual({ height: 6, width: 8, length: 10 });
    // too big once clearance is added
    expect(packIn([{ product: prod({ partNumber: "B", length: 9.6 }), quantity: 1 }], box, s, [])).toBeNull();
  });

  it("mailers: thickness limit, and the sealed size shrinks around the contents", () => {
    const thin = prod({ partNumber: "T", height: 0.5, width: 5, length: 8, weight: 0.3 });
    const r = packIn([{ product: thin, quantity: 1 }], mailer, s, [ups])!;
    expect(r.shippedDims).toEqual({ height: 0.75, width: 5.5, length: 8.5 }); // 0.5 product + 0.25 material
    expect(r.dimWeight).toBe(0.252); // 8.5 × 5.5 × 0.75 ÷ 139
    expect(r).toMatchObject({ actualWeight: 0.4, billedWeight: 0.4, volumeUtilization: 57, fitQuality: "loose" });
    // two stack to 1.0 in.: over the 1 in. limit with 0.5 in. clearance, fine without
    expect(packIn([{ product: thin, quantity: 2 }], mailer, s, [])).toBeNull();
    expect(packIn([{ product: thin, quantity: 2 }], mailer, { ...s, fitClearance: 0 }, [])).not.toBeNull();
  });

  it("several items use the pack efficiency share of the box", () => {
    const small = prod({ partNumber: "S", height: 2, width: 4, length: 5, weight: 0.5 }); // 40 in³
    // 480 × 0.7 = 336 in³: 8 fit (320), 9 don't (360)
    expect(packIn([{ product: small, quantity: 8 }], box, s, [])).not.toBeNull();
    expect(packIn([{ product: small, quantity: 9 }], box, s, [])).toBeNull();
  });

  it("folds foldable products: half the length, double the thickness", () => {
    expect(foldedProduct(prod({ partNumber: "F", height: 1, width: 10, length: 20, foldable: true }))).toMatchObject({ height: 2, width: 10, length: 10 });
    const scarf = prod({ partNumber: "F", height: 1, width: 6, length: 16, foldable: true, weight: 0.5 });
    const r = rankPackaging([{ product: scarf, quantity: 1 }], [box, mailer], s, []);
    expect(r.map((x) => x.packaging.id)).toEqual(["box"]); // folded to 8 × 6 × 2: fits the box, too thick for the mailer
    expect(r[0].hasFoldedItems).toBe(true);
  });

  it("flags overweight and every-method DIM", () => {
    const heavy = prod({ partNumber: "H", weight: 25 });
    expect(packIn([{ product: heavy, quantity: 1 }], box, s, [ups])!.overweight).toBe(true);
    const light = prod({ partNumber: "L", weight: 0.5 });
    expect(packIn([{ product: light, quantity: 1 }], box, s, [ups])!.dimFlag).toBe(true); // only UPS, and it bills by DIM
  });
});

describe("whole shipments", () => {
  it("merges lines, prices ships-own items alone, ranks the rest, and calls LTL", () => {
    const own = prod({ partNumber: "OWN", height: 12, width: 12, length: 12, weight: 10, shipsOwn: true });
    const a = analyzeShipment(
      [
        { product: prod({ partNumber: "A" }), quantity: 1 },
        { product: own, quantity: 2 },
      ],
      [mailer, box],
      [ups, usps, ltl],
      s,
    );
    expect(a.items.map((i) => [i.product.partNumber, i.quantity])).toEqual([["A", 1], ["OWN", 2]]);
    expect(a).toMatchObject({ totalUnits: 3, totalActualWeight: 22, ltlRequired: false, ltlShipping: [] });
    expect(a.results.map((r) => r.packaging.id)).toEqual(["box"]);
    // 1,728 in³ ÷ 139 = 12.4 → 13 lb by DIM on UPS, but USPS (threshold 1,728 in³) bills its actual 10 lb; LTL methods are never offered for parcels
    expect(a.standalone[0]).toMatchObject({ unitDimWeight: 13, unitBilledWeight: 10, totalBilledWeight: 20, dimFlag: false });
    expect(a.standalone[0].shipping.map((m) => m.methodId)).toEqual(["ups", "usps"]);
    const merged = analyzeShipment([{ product: prod({ partNumber: "A" }), quantity: 1 }, { product: prod({ partNumber: "A" }), quantity: 2 }], [box], [], s);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].quantity).toBe(3);

    const freight = analyzeShipment([{ product: prod({ partNumber: "PALLET", weight: 160 }), quantity: 1 }], [box], [ups, ltl], s);
    expect(freight).toMatchObject({ ltlRequired: true });
    expect(freight.ltlShipping).toEqual([{ methodId: "ltl", methodName: "LTL", billedWeight: 160, dimWeight: 0, dimApplied: false, rate: 120, rateBreak: 500 }]);
  });

  it("a ships-own product prices by its own size", () => {
    const r = standaloneResult(prod({ partNumber: "O", height: 2, width: 2, length: 2, weight: 1.5, shipsOwn: true }), 1, s, [usps]);
    expect(r).toMatchObject({ unitDimWeight: 0.058, unitBilledWeight: 2, dimFlag: false });
  });
});

describe("catalog report", () => {
  it("coverage, gaps, DIM exposure by method and packaging use", async () => {
    const products = [
      prod({ partNumber: "A" }), // box, good, UPS DIM
      prod({ partNumber: "T", height: 0.5, width: 5, length: 8, weight: 0.3 }), // mailer (loose) or box
      prod({ partNumber: "BIG", height: 20, width: 20, length: 20 }), // fits nothing
      prod({ partNumber: "OWN", height: 12, width: 12, length: 12, weight: 10, shipsOwn: true }),
    ];
    const r = await analyzeCatalog(products, [box, mailer], [ups, usps, ltl], s);
    expect(r).toMatchObject({ products: 4, packaging: 2, methods: 2, covered: 3, noFit: 1, coverageRate: 75 });
    const byPart = Object.fromEntries(r.results.map((x) => [x.partNumber, x]));
    expect(byPart.A).toMatchObject({ packagingName: "Box 10x8x6", options: 1, billedWeight: 3, dimExposed: true, cheapest: { methodName: "USPS Ground Advantage", billedWeight: 3, rate: 7 } });
    expect(byPart.T).toMatchObject({ packagingId: "mailer", options: 2, fitQuality: "loose" });
    expect(byPart.BIG).toMatchObject({ packagingId: null, billedWeight: null, shippedDims: null });
    expect(byPart.OWN).toMatchObject({ packagingName: "Ships in own packaging", shippedDims: { height: 12, width: 12, length: 12 }, billedWeight: 10 }); // USPS bills its actual weight under 1,728 in³
    expect(r.looseOnly).toBe(1);
    const boxStat = r.packagingStats.find((p) => p.id === "box")!;
    expect(boxStat).toMatchObject({ fits: 2, bestFits: 1, soleOption: 1 });
    expect(r.dimByMethod.find((m) => m.methodId === "ups")).toMatchObject({ count: 2 }); // A and OWN; T's mailer bills by actual weight
    expect(r).toMatchObject({ dimExposed: 2, dimExposureRate: 50 });
  });
});

describe("ranking", () => {
  it("puts packaging over its weight limit after the rest", () => {
    const tight: Packaging = { ...box, id: "tight", name: "Tight box", height: 5.5, width: 7.5, length: 9.5, maxWeight: 1 };
    const r = rankPackaging([{ product: prod({ partNumber: "A" }), quantity: 1 }], [box, tight], s, []);
    // the tight box is fuller but over its 1 lb limit
    expect(r.map((x) => [x.packaging.id, x.overweight])).toEqual([["box", false], ["tight", true]]);
  });
});

describe("mailers wrap around thick products", () => {
  it("doesn't offer a mailer the product can't fit once it's wrapped (no more than 100% used)", () => {
    // 9.5 × 8 × 3 in. headlamp, 13 × 10 in. poly mailer (3.5 in. max): flat it fits, sealed it would be 10 × 7 in.
    const lamp = prod({ partNumber: "78834", height: 3, width: 8, length: 9.5, weight: 0.75 });
    const poly: Packaging = { id: "poly", name: "Poly Mailer 13 x 10", type: "poly_mailer", height: 0.1, width: 10, length: 13, maxHeight: 3.5, maxWeight: null, tareWeight: 0.03 };
    const bigBubble: Packaging = { id: "bub", name: "Bubble Mailer 17.5 x 15", type: "bubble_mailer", height: 0.15, width: 15, length: 17.5, maxHeight: 4, maxWeight: null, tareWeight: 0.12 };
    const box10: Packaging = { ...box, id: "b10", name: "Box 10x10x5", height: 10, width: 10, length: 5, maxWeight: null, tareWeight: 0.45 };
    expect(packIn([{ product: lamp, quantity: 1 }], poly, s, [])).toBeNull();
    const r = rankPackaging([{ product: lamp, quantity: 1 }], [poly, bigBubble, box10], s, []);
    expect(r.map((x) => [x.packaging.id, x.volumeUtilization])).toEqual([["b10", 45.6], ["bub", 41.6]]);
    // sealed 14.5 × 12 × 3.15 in. still holds the 9.5 × 8 in. footprint
    expect(r[1].shippedDims).toEqual({ height: 3.15, width: 12, length: 14.5 });
    for (const x of r) expect(x.volumeUtilization).toBeLessThanOrEqual(100);
  });
});

describe("foldable products", () => {
  it("are tried flat and folded; the fuller fit wins", () => {
    // 13.25 × 9.5 × 5.5 in. foldable: flat it fits a 14 × 10 × 6 box; folded (11 × 9.5 × 6.6) it's too tall for it
    const brushes = prod({ partNumber: "W", height: 5.5, width: 9.5, length: 13.25, weight: 2.4, foldable: true });
    const b14: Packaging = { ...box, id: "b14", name: "Box 14x10x6", height: 6, width: 10, length: 14, maxWeight: null };
    const r = packIn([{ product: brushes, quantity: 1 }], b14, s, [])!;
    expect(r).not.toBeNull();
    expect(r.hasFoldedItems).toBe(false);
    // a flat scarf only fits a small mailer folded
    const scarf = prod({ partNumber: "F", height: 0.25, width: 6, length: 16, foldable: true, weight: 0.3 });
    const m: Packaging = { ...mailer, id: "m", width: 8, length: 10, maxHeight: 1.5 };
    expect(packIn([{ product: scarf, quantity: 1 }], m, s, [])!.hasFoldedItems).toBe(true);
  });
});
