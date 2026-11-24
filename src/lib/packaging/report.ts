import {
  billedOn,
  cheapest,
  foldedProduct,
  packIn,
  roundWeight,
  shippingFor,
  type Dims,
  type EngineSettings,
  type FitQuality,
  type Packaging,
  type PackagingType,
  type Product,
  type ShippingMatch,
  type ShippingMethod,
} from "@/lib/packaging/engine";
import { reviewProduct, type Review, type ReviewVerdict } from "@/lib/packaging/review";

// Packaging analysis: every product (one unit) against every active packaging option. Coverage, gaps,
// DIM exposure by shipping method, and how much each packaging option is used. Pure: the caller loads
// the catalog and stores the result.

export type ProductResult = {
  partNumber: string;
  name: string;
  /** The product's own size and weight (from Salsify). */
  height: number;
  width: number;
  length: number;
  weight: number;
  foldable: boolean;
  shipsOwn: boolean;
  /** Best packaging (null: ships in own carton, or nothing fits). */
  packagingId: string | null;
  packagingName: string | null;
  fitQuality: FitQuality | null;
  volumeUtilization: number | null;
  /** Products + tare. */
  actualWeight: number;
  dimWeight: number;
  billedWeight: number | null;
  dimExposed: boolean;
  /** Packaging options it fits. */
  options: number;
  shippedDims: Dims | null;
  cheapest: { methodName: string; billedWeight: number; rate: number } | null;
  /** Shipping methods that bill it by DIM: name, DIM weight, billed weight. */
  dimMethods: { methodName: string; dimWeight: number; billedWeight: number }[];
  /** How it ships today against the recommendation (missing on reports made before the review existed). */
  review?: Review;
};

export type ReviewSummary = {
  /** Products with a packaged size and weight in Salsify. */
  withPacked: number;
  counts: Record<ReviewVerdict, number>;
  /** Across "could be packaged better": per shipment of one unit of each, summed. */
  savingRate: number;
  savingLb: number;
};

export type PackagingStat = {
  id: string;
  name: string;
  type: PackagingType;
  dims: Dims;
  fits: number;
  bestFits: number;
  /** It's the only option for at least one product. */
  soleOption: number;
  quality: Record<FitQuality, number>;
  avgUtilization: number | null;
};

export type CatalogReport = {
  settings: EngineSettings;
  products: number;
  packaging: number;
  methods: number;
  covered: number;
  noFit: number;
  looseOnly: number;
  coverageRate: number;
  dimExposed: number;
  dimExposureRate: number;
  packagingStats: PackagingStat[];
  dimByMethod: { methodId: string; methodName: string; count: number; pct: number }[];
  typeBreakdown: { type: PackagingType; options: number; bestFits: number; avgUtilization: number | null }[];
  review?: ReviewSummary;
  results: ProductResult[];
};

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 10 : 0);
const dimRows = (shipping: ShippingMatch[]) => shipping.filter((m) => m.dimApplied).map((m) => ({ methodName: m.methodName, dimWeight: m.dimWeight, billedWeight: m.billedWeight }));
const cheapestOf = (shipping: ShippingMatch[]) => {
  const c = cheapest(shipping);
  return c ? { methodName: c.methodName, billedWeight: c.billedWeight, rate: c.rate! } : null;
};

/** `onProgress` is called every 200 products (and can yield to the event loop). */
export async function analyzeCatalog(products: Product[], packaging: Packaging[], methods: ShippingMethod[], s: EngineSettings, onProgress?: (done: number) => Promise<void>): Promise<CatalogReport> {
  const parcel = methods.filter((m) => !m.isLtl);
  const stats = new Map<string, PackagingStat & { utilSum: number }>(
    packaging.map((p) => [p.id, { id: p.id, name: p.name, type: p.type, dims: { height: p.height, width: p.width, length: p.length }, fits: 0, bestFits: 0, soleOption: 0, quality: { exact: 0, good: 0, loose: 0, large: 0 }, avgUtilization: null, utilSum: 0 }]),
  );
  const byMethod = new Map(parcel.map((m) => [m.id, { methodId: m.id, methodName: m.name, count: 0 }]));
  const results: ProductResult[] = [];
  let covered = 0, noFit = 0, looseOnly = 0, dimExposed = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const base = { partNumber: p.partNumber, name: p.name, height: p.height, width: p.width, length: p.length, weight: p.weight, foldable: p.foldable, shipsOwn: p.shipsOwn };

    if (p.shipsOwn) {
      covered++;
      const volume = p.height * p.width * p.length;
      const dimWeight = roundWeight(volume / s.dimDivisor);
      const shipping = shippingFor(volume, p.weight, s.dimDivisor, parcel);
      const exposed = shipping.some((m) => m.dimApplied);
      if (exposed) dimExposed++;
      for (const m of shipping) if (m.dimApplied) byMethod.get(m.methodId)!.count++;
      results.push({ ...base, packagingId: null, packagingName: "Ships in own packaging", fitQuality: null, volumeUtilization: null, actualWeight: p.weight, dimWeight, billedWeight: billedOn(shipping, p.weight, dimWeight), dimExposed: exposed, options: 0, shippedDims: { height: p.height, width: p.width, length: p.length }, cheapest: cheapestOf(shipping), dimMethods: dimRows(shipping) });
    } else {
      const fits = packaging
        .map((pkg) => packIn([{ product: p, quantity: 1 }], pkg, s, parcel))
        .filter((r) => r != null)
        .sort((a, b) => Number(a.overweight) - Number(b.overweight) || b.volumeUtilization - a.volumeUtilization);
      if (!fits.length) {
        noFit++;
        const f = foldedProduct(p);
        results.push({ ...base, packagingId: null, packagingName: null, fitQuality: null, volumeUtilization: null, actualWeight: p.weight, dimWeight: roundWeight((f.height * f.width * f.length) / s.dimDivisor), billedWeight: null, dimExposed: false, options: 0, shippedDims: null, cheapest: null, dimMethods: [] });
      } else {
        covered++;
        if (fits.every((r) => r.fitQuality === "loose" || r.fitQuality === "large")) looseOnly++;
        const best = fits[0];
        const exposed = best.shipping.some((m) => m.dimApplied);
        if (exposed) dimExposed++;
        for (const m of best.shipping) if (m.dimApplied) byMethod.get(m.methodId)!.count++;
        for (const r of fits) {
          const st = stats.get(r.packaging.id)!;
          st.fits++;
          st.quality[r.fitQuality]++;
          st.utilSum += r.volumeUtilization;
        }
        const bestStat = stats.get(best.packaging.id)!;
        bestStat.bestFits++;
        if (fits.length === 1) bestStat.soleOption++;
        results.push({
          ...base,
          packagingId: best.packaging.id,
          packagingName: best.packaging.name,
          fitQuality: best.fitQuality,
          volumeUtilization: best.volumeUtilization,
          actualWeight: best.actualWeight,
          dimWeight: best.dimWeight,
          billedWeight: best.billedWeight,
          dimExposed: exposed,
          options: fits.length,
          shippedDims: best.shippedDims,
          cheapest: cheapestOf(best.shipping),
          dimMethods: dimRows(best.shipping),
        });
      }
    }
    if (onProgress && (i + 1) % 200 === 0) await onProgress(i + 1);
  }

  // packaging review: today's package (from Salsify) against the recommendation, product by product
  const review: ReviewSummary = { withPacked: 0, counts: { ok: 0, better: 0, expired: 0, undersized: 0, noOption: 0, noPacked: 0 }, savingRate: 0, savingLb: 0 };
  results.forEach((r, i) => {
    const rec = r.packagingName && r.shippedDims ? { name: r.packagingName, shippedDims: r.shippedDims, actualWeight: r.actualWeight } : null;
    r.review = reviewProduct(products[i], rec, packaging, s, methods);
    review.counts[r.review.verdict]++;
    if (r.review.current) review.withPacked++;
    if (r.review.verdict === "better") {
      review.savingRate += r.review.savingRate ?? 0;
      review.savingLb += r.review.savingLb ?? 0;
    }
  });
  review.savingRate = Math.round(review.savingRate * 100) / 100;
  review.savingLb = Math.round(review.savingLb * 100) / 100;

  const packagingStats: PackagingStat[] = [...stats.values()]
    .map(({ utilSum, ...st }) => ({ ...st, avgUtilization: st.fits ? Math.round((utilSum / st.fits) * 10) / 10 : null }))
    .sort((a, b) => b.bestFits - a.bestFits || b.fits - a.fits);

  const types = new Map<PackagingType, { options: number; bestFits: number; utilSum: number; fits: number }>();
  for (const st of packagingStats) {
    const t = types.get(st.type) ?? { options: 0, bestFits: 0, utilSum: 0, fits: 0 };
    t.options++;
    t.bestFits += st.bestFits;
    if (st.avgUtilization != null) {
      t.utilSum += st.avgUtilization * st.fits;
      t.fits += st.fits;
    }
    types.set(st.type, t);
  }

  return {
    settings: s,
    products: products.length,
    packaging: packaging.length,
    methods: parcel.length,
    covered,
    noFit,
    looseOnly,
    coverageRate: pct(covered, products.length),
    dimExposed,
    dimExposureRate: pct(dimExposed, products.length),
    packagingStats,
    dimByMethod: [...byMethod.values()].map((m) => ({ ...m, pct: pct(m.count, products.length) })).sort((a, b) => b.count - a.count),
    review,
    typeBreakdown: [...types.entries()]
      .map(([type, t]) => ({ type, options: t.options, bestFits: t.bestFits, avgUtilization: t.fits ? Math.round((t.utilSum / t.fits) * 10) / 10 : null }))
      .sort((a, b) => b.bestFits - a.bestFits),
    results,
  };
}

/** Results needing attention, by issue. */
export const gaps = {
  noFit: (r: ProductResult) => !r.shipsOwn && r.packagingId == null,
  looseOnly: (r: ProductResult) => r.fitQuality === "loose" || r.fitQuality === "large",
  dim: (r: ProductResult) => r.dimExposed,
};

