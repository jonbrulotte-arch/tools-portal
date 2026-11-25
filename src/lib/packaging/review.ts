import { billedOn, cheapest, foldedProduct, roundWeight, shippingFor, sortedDims, type Dims, type EngineSettings, type Packaging, type Product, type ShippingMethod } from "@/lib/packaging/engine";

// Packaging review: how each product ships today (its packaged size and weight in Salsify) against the
// configurator's recommendation, priced the same way. Pure.

export type ReviewVerdict =
  /** Today's package bills the same as the recommendation (or is that packaging). */
  | "ok"
  /** The recommendation bills less: the product could be packaged better. */
  | "better"
  /**
   * Today's package bills less than anything we have set up. Our options are the packaging we ship in, so
   * it can't be one of them: a retired (expired) packaging option still recorded in Salsify.
   */
  | "expired"
  /** The packaged size is smaller than the product: the Salsify data needs checking. */
  | "undersized"
  /** None of our packaging fits the product, so there's nothing to compare with. */
  | "noOption"
  /** Salsify has no packaged size and weight. */
  | "noPacked";

export const VERDICT_LABELS: Record<ReviewVerdict, string> = {
  ok: "Configured correctly",
  better: "Could be packaged better",
  expired: "Expired packaging option",
  undersized: "Packaged size smaller than the product",
  noOption: "No packaging of ours fits",
  noPacked: "No packaged size in Salsify",
};

/** A package priced the configurator's way. */
export type PricedPackage = { dims: Dims; weight: number; dimWeight: number; billedWeight: number; cheapest: { methodName: string; billedWeight: number; rate: number } | null };

export type Review = {
  verdict: ReviewVerdict;
  current: (PricedPackage & { matches: string | null }) | null;
  /** Per shipment of one unit: today minus the recommendation (positive = the recommendation saves). */
  savingRate: number | null;
  savingLb: number | null;
};

/** Sides within this of each other count as the same packaging. */
export const MATCH_TOLERANCE_IN = 0.5;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function pricePackage(dims: Dims, weight: number, s: EngineSettings, methods: ShippingMethod[]): PricedPackage {
  const volume = dims.height * dims.width * dims.length;
  const dimWeight = roundWeight(volume / s.dimDivisor);
  const shipping = shippingFor(volume, weight, s.dimDivisor, methods.filter((m) => !m.isLtl));
  const c = cheapest(shipping);
  return { dims, weight, dimWeight, billedWeight: billedOn(shipping, weight, dimWeight), cheapest: c ? { methodName: c.methodName, billedWeight: c.billedWeight, rate: c.rate! } : null };
}

const sameSize = (a: Dims, b: Dims) => {
  const x = sortedDims(a.height, a.width, a.length);
  const y = sortedDims(b.height, b.width, b.length);
  return x.every((v, i) => Math.abs(v - y[i]) <= MATCH_TOLERANCE_IN);
};

/** The packaging option today's package looks like (its size, or a mailer's sealed size), if any. */
export function matchingPackaging(packed: Dims, packaging: Packaging[], recommended?: { name: string; shippedDims: Dims } | null): string | null {
  if (recommended && sameSize(packed, recommended.shippedDims)) return recommended.name;
  return packaging.find((p) => sameSize(packed, p))?.name ?? null;
}

/** Smaller than the product on any side (folded or not), so it can't be the real package. */
function undersized(packed: Dims, p: Product) {
  const box = sortedDims(packed.height, packed.width, packed.length);
  const fits = (q: Product) => sortedDims(q.height, q.width, q.length).every((v, i) => box[i] + 0.05 >= v);
  return !fits(p) && !fits(foldedProduct(p));
}

/**
 * Compares today's package with the recommendation (null: nothing fits). Prices on the cheapest rated
 * method when both have one, else on the billed weight at the global DIM divisor.
 */
export function reviewProduct(
  p: Product & { packed?: (Dims & { weight: number }) | null },
  recommended: { name: string; shippedDims: Dims; actualWeight: number } | null,
  packaging: Packaging[],
  s: EngineSettings,
  methods: ShippingMethod[],
): Review {
  if (!p.packed) return { verdict: "noPacked", current: null, savingRate: null, savingLb: null };
  const dims = { height: p.packed.height, width: p.packed.width, length: p.packed.length };
  const current = { ...pricePackage(dims, p.packed.weight, s, methods), matches: matchingPackaging(dims, packaging, recommended) };
  if (undersized(dims, p)) return { verdict: "undersized", current, savingRate: null, savingLb: null };
  if (!recommended) return { verdict: "noOption", current, savingRate: null, savingLb: null };
  const rec = pricePackage(recommended.shippedDims, recommended.actualWeight, s, methods);
  const savingLb = r2(current.billedWeight - rec.billedWeight);
  const savingRate = current.cheapest && rec.cheapest ? r2(current.cheapest.rate - rec.cheapest.rate) : null;
  const diff = savingRate ?? savingLb;
  // a product that ships in its own carton can legitimately bill less than our estimate of that carton
  const verdict: ReviewVerdict = current.matches === recommended.name || Math.abs(diff) < 0.005 || (diff < 0 && p.shipsOwn) ? "ok" : diff > 0 ? "better" : "expired";
  return { verdict, current, savingRate, savingLb };
}

/** Reports saved before the rename call "expired" "currentBetter". */
export const normalizeVerdict = (v: string): ReviewVerdict => (v === "currentBetter" ? "expired" : (v as ReviewVerdict));
