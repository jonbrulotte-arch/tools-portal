// Packaging Configurator engine: which packaging fits a shipment, how well, and what each shipping
// method bills for it (actual vs dimensional weight, rate card). Pure functions, no database.
// Ported from the stand-alone Packaging Configurator; the rules are unchanged.

export const PACKAGING_TYPES = ["box", "bubble_mailer", "poly_mailer", "other"] as const;
export type PackagingType = (typeof PACKAGING_TYPES)[number];
export const PACKAGING_TYPE_LABELS: Record<PackagingType, string> = { box: "Box", bubble_mailer: "Bubble mailer", poly_mailer: "Poly mailer", other: "Other" };

export type Product = {
  partNumber: string;
  name: string;
  height: number;
  width: number;
  length: number;
  weight: number;
  foldable: boolean;
  shipsOwn: boolean;
  upc?: string | null;
  /** How it ships today, from Salsify (only the Packaging review uses it). */
  packed?: { height: number; width: number; length: number; weight: number } | null;
};

export type Packaging = {
  id: string;
  name: string;
  type: PackagingType;
  height: number;
  width: number;
  length: number;
  /** Thickness limit for mailers and flat-pack boxes: products stack flat up to this height. */
  maxHeight: number | null;
  maxWeight: number | null;
  /** Tare: the packaging's own weight. */
  tareWeight: number | null;
  notes?: string | null;
};

export type RateBreak = { maxWeight: number; rate: number };

export type ShippingMethod = {
  id: string;
  name: string;
  minWeight: number;
  maxWeight: number | null;
  /** Overrides the global DIM divisor. */
  dimDivisor: number | null;
  /** DIM only applies above this package volume (cubic inches). */
  dimThreshold: number | null;
  isLtl: boolean;
  rates: RateBreak[];
};

export type EngineSettings = {
  dimDivisor: number;
  /** Share of a box's volume that several items can realistically fill (0–1). */
  packEfficiency: number;
  /** Shipments at or above this actual weight need LTL freight. */
  ltlThreshold: number;
  /** Clearance added to each product dimension when checking a fit (inches). */
  fitClearance: number;
};

export type FitQuality = "exact" | "good" | "loose" | "large";
export const FIT_LABELS: Record<FitQuality, string> = { exact: "Exact fit", good: "Good fit", loose: "Loose fit", large: "Oversized" };

export type Dims = { height: number; width: number; length: number };

export type ShippingMatch = {
  methodId: string;
  methodName: string;
  billedWeight: number;
  dimWeight: number;
  dimApplied: boolean;
  rate: number | null;
  /** The "up to X lb" break that priced it. */
  rateBreak: number | null;
};

export type PackagingResult = {
  packaging: Packaging;
  productsWeight: number;
  packagingWeight: number;
  /** Products + tare. */
  actualWeight: number;
  /** max(actual, DIM) at the global divisor, rounded the carrier way. */
  billedWeight: number;
  dimWeight: number;
  /** Every shipping method bills this package by DIM (no DIM-free option). */
  dimFlag: boolean;
  overweight: boolean;
  volumeUtilization: number;
  fitQuality: FitQuality;
  hasFoldedItems: boolean;
  shipping: ShippingMatch[];
  /** The sealed package's size (mailers shrink around their contents). */
  shippedDims: Dims;
};

export type StandaloneResult = {
  product: Product;
  quantity: number;
  productsWeight: number;
  unitDimWeight: number;
  unitBilledWeight: number;
  totalBilledWeight: number;
  dimFlag: boolean;
  shipping: ShippingMatch[];
};

export type ShipmentItem = { product: Product; quantity: number };

export type ShipmentAnalysis = {
  items: ShipmentItem[];
  totalActualWeight: number;
  totalUnits: number;
  results: PackagingResult[];
  standalone: StandaloneResult[];
  ltlRequired: boolean;
  ltlShipping: ShippingMatch[];
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function sortedDims(h: number, w: number, l: number): [number, number, number] {
  return [h, w, l].sort((a, b) => b - a) as [number, number, number];
}

/** Carriers bill whole pounds from 1 lb up; under 1 lb the decimal is kept. */
export function roundWeight(w: number): number {
  if (w >= 1) return Math.ceil(w - 1e-9);
  return Math.round(w * 1000) / 1000;
}

/** Foldable: halve the longest side and double the thinnest (volume unchanged). */
export function foldedProduct(p: Product): Product {
  if (!p.foldable) return p;
  const [longest, middle, shortest] = sortedDims(p.height, p.width, p.length);
  return { ...p, height: shortest * 2, width: middle, length: longest / 2 };
}

/** With a max height, the thickness limit stands in for the height in fit and volume checks. */
function effectiveBoxDims(box: Packaging): [number, number, number] {
  return sortedDims(box.maxHeight ?? box.height, box.width, box.length);
}

export function isFlexibleMailer(box: Packaging) {
  return (box.type === "bubble_mailer" || box.type === "poly_mailer") && box.maxHeight != null;
}

/**
 * A mailer wraps around its contents: each flat side loses the contents' thickness. So the product's two
 * larger sides plus the (stacked) thickness plus clearance must fit the flat size, and the thickness plus
 * clearance must be within the max height.
 */
function mailerFits(sides: [number, number], thickness: number, box: Packaging, clearance: number) {
  const flat1 = Math.max(box.width, box.length);
  const flat2 = Math.min(box.width, box.length);
  return box.maxHeight! >= thickness + clearance && flat1 >= sides[0] + thickness + clearance && flat2 >= sides[1] + thickness + clearance;
}

export function productFits(product: Product, box: Packaging, clearance = 0): boolean {
  const [p1, p2, p3] = sortedDims(product.height, product.width, product.length);
  if (isFlexibleMailer(box)) return mailerFits([p1, p2], p3, box, clearance);
  const [b1, b2, b3] = effectiveBoxDims(box);
  return b1 >= p1 + clearance && b2 >= p2 + clearance && b3 >= p3 + clearance;
}

/** Every item fits on its own, and together: stacked thickness (max height) or volume × pack efficiency. */
export function allItemsFit(items: ShipmentItem[], box: Packaging, packEfficiency: number, clearance = 0): boolean {
  if (!items.every((i) => productFits(i.product, box, clearance))) return false;
  const units = items.reduce((s, i) => s + i.quantity, 0);
  if (units === 1) return true;
  if (box.maxHeight != null) {
    const thickness = items.reduce((s, i) => s + sortedDims(i.product.height, i.product.width, i.product.length)[2] * i.quantity, 0);
    if (isFlexibleMailer(box)) return items.every((i) => mailerFits(sortedDims(i.product.height, i.product.width, i.product.length).slice(0, 2) as [number, number], thickness, box, clearance));
    return thickness + clearance <= box.maxHeight;
  }
  const volume = items.reduce((s, i) => s + i.product.height * i.product.width * i.product.length * i.quantity, 0);
  const [b1, b2, b3] = effectiveBoxDims(box);
  return volume <= b1 * b2 * b3 * packEfficiency;
}

export function fitQuality(pct: number): FitQuality {
  if (pct >= 90) return "exact";
  if (pct >= 60) return "good";
  if (pct >= 35) return "loose";
  return "large";
}

/** The first rate break that covers the billed weight ("up to X lb"); null with no card or past its end. */
export function rateFor(rates: RateBreak[], billed: number): { rate: number; rateBreak: number } | null {
  const sorted = [...rates].sort((a, b) => a.maxWeight - b.maxWeight);
  const hit = sorted.find((b) => billed <= b.maxWeight);
  return hit ? { rate: hit.rate, rateBreak: hit.maxWeight } : null;
}

/** Each parcel method's billed weight for a package (DIM unless under its threshold), within its weight range. */
export function shippingFor(dimVolume: number, actualWeight: number, globalDivisor: number, methods: ShippingMethod[]): ShippingMatch[] {
  const out: ShippingMatch[] = [];
  for (const m of methods) {
    const dimWeight = roundWeight(dimVolume / (m.dimDivisor ?? globalDivisor));
    const dimApplies = m.dimThreshold == null || dimVolume > m.dimThreshold;
    const billed = dimApplies ? roundWeight(Math.max(actualWeight, dimWeight)) : roundWeight(actualWeight);
    if (billed < m.minWeight || (m.maxWeight != null && billed > m.maxWeight)) continue;
    const r = rateFor(m.rates, billed);
    out.push({ methodId: m.id, methodName: m.name, billedWeight: billed, dimWeight, dimApplied: dimApplies && dimWeight > actualWeight, rate: r?.rate ?? null, rateBreak: r?.rateBreak ?? null });
  }
  return out;
}

/** LTL freight: no DIM, matched by actual weight. */
export function ltlShippingFor(actualWeight: number, methods: ShippingMethod[]): ShippingMatch[] {
  const billed = roundWeight(actualWeight);
  return methods
    .filter((m) => billed >= m.minWeight && (m.maxWeight == null || billed <= m.maxWeight))
    .map((m) => {
      const r = rateFor(m.rates, billed);
      return { methodId: m.id, methodName: m.name, billedWeight: billed, dimWeight: 0, dimApplied: false, rate: r?.rate ?? null, rateBreak: r?.rateBreak ?? null };
    });
}

/** The cheapest rated method, or null when none has a rate. */
export function cheapest(matches: ShippingMatch[]): ShippingMatch | null {
  let best: ShippingMatch | null = null;
  for (const m of matches) if (m.rate != null && (best == null || m.rate < best.rate!)) best = m;
  return best;
}

/** A product that ships in its own carton: DIM straight from its own size. */
export function standaloneResult(product: Product, quantity: number, s: EngineSettings, methods: ShippingMethod[]): StandaloneResult {
  const volume = product.height * product.width * product.length;
  const unitDimWeight = roundWeight(volume / s.dimDivisor);
  const unitBilledWeight = roundWeight(Math.max(product.weight, unitDimWeight));
  return {
    product,
    quantity,
    productsWeight: r3(product.weight * quantity),
    unitDimWeight,
    unitBilledWeight,
    totalBilledWeight: unitBilledWeight * quantity,
    dimFlag: unitDimWeight > product.weight,
    shipping: shippingFor(volume, product.weight, s.dimDivisor, methods),
  };
}

/**
 * One packaging option for a set of items, or null if they don't fit. Foldable items are tried both as they
 * are and folded (folding can make an item too thick for a box it fits flat); the fuller fit wins.
 */
export function packIn(items: ShipmentItem[], pkg: Packaging, s: EngineSettings, methods: ShippingMethod[]): PackagingResult | null {
  const flat = packAs(items, items, pkg, s, methods, false);
  if (!items.some((i) => i.product.foldable)) return flat;
  const folded = packAs(items, items.map((i) => ({ ...i, product: foldedProduct(i.product) })), pkg, s, methods, true);
  if (!flat || !folded) return flat ?? folded;
  return folded.volumeUtilization > flat.volumeUtilization ? folded : flat;
}

function packAs(items: ShipmentItem[], folded: ShipmentItem[], pkg: Packaging, s: EngineSettings, methods: ShippingMethod[], didFold: boolean): PackagingResult | null {
  if (!allItemsFit(folded, pkg, s.packEfficiency, s.fitClearance)) return null;
  const productsWeight = items.reduce((sum, i) => sum + i.product.weight * i.quantity, 0);
  const productVolume = folded.reduce((sum, i) => sum + i.product.height * i.product.width * i.product.length * i.quantity, 0);
  const [e1, e2, e3] = effectiveBoxDims(pkg);
  const boxVolume = e1 * e2 * e3;

  // With a max height the carrier measures the sealed package: its thickness is the stacked products
  // (plus the mailer material); a flexible mailer's flat size shrinks as it wraps around them.
  let dimVolume = boxVolume;
  let shippedDims: Dims = { height: pkg.height, width: pkg.width, length: pkg.length };
  if (pkg.maxHeight != null) {
    const thickness = folded.reduce((sum, i) => sum + sortedDims(i.product.height, i.product.width, i.product.length)[2] * i.quantity, 0);
    const material = pkg.type === "bubble_mailer" || pkg.type === "poly_mailer" ? pkg.height : 0;
    const packed = thickness + material;
    if (isFlexibleMailer(pkg)) {
      const flat1 = Math.max(pkg.width, pkg.length);
      const flat2 = Math.min(pkg.width, pkg.length);
      dimVolume = (flat1 - thickness) * (flat2 - thickness) * packed;
      shippedDims = { height: r3(packed), width: r3(flat2 - thickness), length: r3(flat1 - thickness) };
    } else {
      dimVolume = e1 * e2 * packed;
      shippedDims = { height: r3(packed), width: pkg.width, length: pkg.length };
    }
  }

  const dimWeight = roundWeight(dimVolume / s.dimDivisor);
  const tare = pkg.tareWeight ?? 0;
  const actualWeight = productsWeight + tare;
  const packedVolume = pkg.maxHeight != null ? dimVolume : boxVolume;
  const volumeUtilization = Math.round((productVolume / packedVolume) * 1000) / 10;
  const shipping = shippingFor(dimVolume, actualWeight, s.dimDivisor, methods);
  return {
    packaging: pkg,
    productsWeight: r3(productsWeight),
    packagingWeight: tare,
    actualWeight: r3(actualWeight),
    billedWeight: roundWeight(Math.max(actualWeight, dimWeight)),
    dimWeight,
    // flag only when no method bills by actual weight (otherwise DIM can be avoided)
    dimFlag: shipping.length > 0 ? shipping.every((m) => m.dimApplied) : dimWeight > actualWeight,
    overweight: pkg.maxWeight != null && actualWeight > pkg.maxWeight,
    volumeUtilization,
    fitQuality: fitQuality(volumeUtilization),
    hasFoldedItems: didFold,
    shipping,
    shippedDims,
  };
}

/** Every packaging option the items fit in, best (fullest) first; options over their weight limit come last. */
export function rankPackaging(items: ShipmentItem[], packaging: Packaging[], s: EngineSettings, methods: ShippingMethod[]): PackagingResult[] {
  return packaging
    .map((p) => packIn(items, p, s, methods))
    .filter((r): r is PackagingResult => r != null)
    .sort((a, b) => Number(a.overweight) - Number(b.overweight) || b.volumeUtilization - a.volumeUtilization);
}

/** Same product listed twice → one line with the quantities added. */
export function mergeItems(items: ShipmentItem[]): ShipmentItem[] {
  const by = new Map<string, ShipmentItem>();
  for (const i of items) {
    const cur = by.get(i.product.partNumber);
    if (cur) cur.quantity += i.quantity;
    else by.set(i.product.partNumber, { product: i.product, quantity: i.quantity });
  }
  return [...by.values()];
}

/**
 * A whole shipment: products that ship in their own carton are priced on their own; the rest are
 * packed together. LTL freight is required at or above the threshold (actual weight).
 */
export function analyzeShipment(items: ShipmentItem[], packaging: Packaging[], methods: ShippingMethod[], s: EngineSettings): ShipmentAnalysis {
  const merged = mergeItems(items);
  const parcel = methods.filter((m) => !m.isLtl);
  const standaloneItems = merged.filter((i) => i.product.shipsOwn);
  const packed = merged.filter((i) => !i.product.shipsOwn);
  const totalActualWeight = r3(merged.reduce((sum, i) => sum + i.product.weight * i.quantity, 0));
  const ltlRequired = totalActualWeight >= s.ltlThreshold;
  return {
    items: merged,
    totalActualWeight,
    totalUnits: merged.reduce((sum, i) => sum + i.quantity, 0),
    results: packed.length ? rankPackaging(packed, packaging, s, parcel) : [],
    standalone: standaloneItems.map((i) => standaloneResult(i.product, i.quantity, s, parcel)),
    ltlRequired,
    ltlShipping: ltlRequired ? ltlShippingFor(totalActualWeight, methods) : [],
  };
}

/** A shipment worth a second look: DIM-billed on every method, overweight, or a loose/oversized fit. */
export const needsReview = (r: PackagingResult) => r.dimFlag || r.overweight || r.fitQuality === "loose" || r.fitQuality === "large";
