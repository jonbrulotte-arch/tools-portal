import { describe, expect, it } from "vitest";
import { matchingPackaging, normalizeVerdict, pricePackage, reviewProduct } from "@/lib/packaging/review";
import { analyzeCatalog } from "@/lib/packaging/report";
import type { Packaging, Product, ShippingMethod } from "@/lib/packaging/engine";

const s = { dimDivisor: 139, packEfficiency: 0.7, ltlThreshold: 150, fitClearance: 0.5 };
const ups: ShippingMethod = { id: "ups", name: "UPS Ground", minWeight: 0, maxWeight: 150, dimDivisor: null, dimThreshold: null, isLtl: false, rates: [{ maxWeight: 5, rate: 10 }, { maxWeight: 10, rate: 15 }, { maxWeight: 20, rate: 22 }, { maxWeight: 30, rate: 28 }] };
const box = (id: string, l: number, w: number, h: number, tare = 0.5): Packaging => ({ id, name: `Box ${l}x${w}x${h}`, type: "box", length: l, width: w, height: h, maxHeight: null, maxWeight: null, tareWeight: tare });
const small = box("s", 10, 8, 6); // 480 in³ → 4 lb DIM
const big = box("b", 18, 14, 12); // 3,024 in³ → 22 lb DIM
const prod = (o: Partial<Product> = {}): Product => ({ partNumber: "A", name: "A", height: 5, width: 7, length: 9, weight: 2, foldable: false, shipsOwn: false, ...o });
const rec = { name: small.name, shippedDims: { height: 6, width: 8, length: 10 }, actualWeight: 2.5 };

describe("packaging review", () => {
  it("prices a package like the configurator", () => {
    expect(pricePackage({ height: 12, width: 14, length: 18 }, 3, s, [ups])).toMatchObject({ dimWeight: 22, billedWeight: 22, cheapest: { methodName: "UPS Ground", billedWeight: 22, rate: 28 } });
  });

  it("finds the packaging today's package looks like (within half an inch, any orientation)", () => {
    expect(matchingPackaging({ height: 10.25, width: 6.2, length: 8 }, [small, big])).toBe("Box 10x8x6");
    expect(matchingPackaging({ height: 11, width: 6, length: 8 }, [small, big])).toBeNull();
  });

  it("calls each case", () => {
    // shipped in the big box today: the recommended small box saves $18 ($28 vs $10) and 18 lb billed
    const better = reviewProduct(prod({ packed: { length: 18, width: 14, height: 12, weight: 3 } }), rec, [small, big], s, [ups]);
    expect(better).toMatchObject({ verdict: "better", savingRate: 18, savingLb: 18, current: { matches: "Box 18x14x12", billedWeight: 22 } });
    // already in the recommended box
    expect(reviewProduct(prod({ packed: { length: 10, width: 8, height: 6, weight: 2.5 } }), rec, [small, big], s, [ups])).toMatchObject({ verdict: "ok", savingRate: 0 });
    // smaller than anything we ship in: an expired packaging option still in Salsify
    expect(reviewProduct(prod({ packed: { length: 9.5, width: 7.5, height: 5.5, weight: 2.3 } }), { ...rec, shippedDims: { height: 12, width: 14, length: 18 } }, [big], s, [ups])).toMatchObject({ verdict: "expired" });
    // ...unless it ships in its own carton
    expect(reviewProduct(prod({ shipsOwn: true, packed: { length: 9.5, width: 7.5, height: 5.5, weight: 2.3 } }), { ...rec, shippedDims: { height: 12, width: 14, length: 18 } }, [big], s, [ups])).toMatchObject({ verdict: "ok" });
    expect(normalizeVerdict("currentBetter")).toBe("expired");
    // packaged size smaller than the product: bad data
    expect(reviewProduct(prod({ packed: { length: 6, width: 4, height: 2, weight: 2 } }), rec, [small], s, [ups]).verdict).toBe("undersized");
    // foldable: a package that fits it folded isn't undersized
    expect(reviewProduct(prod({ height: 1, width: 10, length: 20, foldable: true, packed: { length: 10.5, width: 10.5, height: 2.5, weight: 2 } }), rec, [small], s, [ups]).verdict).not.toBe("undersized");
    expect(reviewProduct(prod({ packed: { length: 30, width: 20, height: 10, weight: 5 } }), null, [], s, [ups]).verdict).toBe("noOption");
    expect(reviewProduct(prod(), rec, [small], s, [ups])).toEqual({ verdict: "noPacked", current: null, savingRate: null, savingLb: null });
  });

  it("compares on billed weight when there are no rates", () => {
    const r = reviewProduct(prod({ packed: { length: 18, width: 14, height: 12, weight: 3 } }), rec, [small, big], s, []);
    expect(r).toMatchObject({ verdict: "better", savingRate: null, savingLb: 18 });
  });

  it("the catalog report counts verdicts and adds up the savings", async () => {
    const products = [
      prod({ partNumber: "A", packed: { length: 18, width: 14, height: 12, weight: 3 } }),
      prod({ partNumber: "B", packed: { length: 10, width: 8, height: 6, weight: 2.5 } }),
      prod({ partNumber: "C" }),
    ];
    const r = await analyzeCatalog(products, [small, big], [ups], s);
    expect(r.review).toEqual({ withPacked: 2, counts: { ok: 1, better: 1, expired: 0, undersized: 0, noOption: 0, noPacked: 1 }, savingRate: 18, savingLb: 18 });
    expect(r.results[0].review?.verdict).toBe("better");
  });
});
