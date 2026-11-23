import { prisma } from "@/lib/prisma";
import { getSetting, type BlendSettings } from "@/lib/settings";
import { ZONES, upsTier, uspsTier } from "@/lib/shipping/weights";
import type { ItemInventory } from "@/lib/shipping/mango-inventory";
import type { ReportSummary, UpsChargeTotals, UpsCharges } from "@/lib/shipping/report";

// Blended shipping cost: one expected cost per unit for a product that may ship from either warehouse.
//   cost = Σ warehouse share × Σ zone share (that warehouse's own zone mix) × cell cost
//   UPS price = quote × (1 + the warehouse's UPS surcharge ratio), when surcharges are on (Settings)
//   UPS = residential share × UPS residential + (1 − residential share) × UPS commercial
//   cell cost, "actual carrier mix": USPS share × USPS + (1 − USPS share) × UPS, the USPS share being what that
//     warehouse really shipped USPS at that weight band in the cost report
//   cell cost, "cheapest carrier": residential share × min(USPS, UPS res) + (1 − residential share) × min(USPS, UPS com)
// SIMPLE VERSION: a warehouse's zone mix is its historical mix, even for a product only one warehouse stocks
// (that warehouse then also covers customers the other one normally serves, so this understates their cost).
// The reality check below shows whether that matters.

export const MIN_OWN_SHIPMENTS = 5;
const MIN_ORIGIN_SHIPMENTS_FOR_RES_SHARE = 50;
/** A warehouse's own carrier split for a weight band needs this many shipments; otherwise the company's is used. */
export const MIN_BAND_MIX_SHIPMENTS = 20;
/** UPS surcharge ratios are capped here, so a report with odd adjustments can't run away with the cost. */
const MAX_UPS_UPLIFT = 0.6;
/**
 * Weight bands starting at or above this get no UPS surcharge. Quotes there already carry additional handling (by
 * the billed weight, so even for boxes UPS bills by size that weigh less), which covers the few large-package and
 * address-correction charges; the 50–150 lb band matched what we paid without surcharges and overshot with them.
 */
export const NO_UPS_SURCHARGE_FROM_LB = 50;
const COVERAGE_OK = 0.8;

export type CarrierMethod = BlendSettings["carrierMethod"];
export const DEFAULT_BLEND: BlendSettings = { carrierMethod: "actual-mix", upsSurcharges: true, upsQuotesIncludeFuel: true };

export type MixData = {
  reportId: string;
  dateFrom: string | null;
  dateTo: string | null;
  /** How carriers are chosen and whether UPS surcharges are added (Settings → Blended cost method). */
  blend: BlendSettings;
  /** Shipments per warehouse and weight band (index into WEIGHT_BANDS), per carrier. */
  carrierMix: Record<string, { ups: number[]; usps: number[] }>;
  /** Each warehouse's UPS charges in the cost report (null for reports processed before charges were kept). */
  upsCharges: Record<string, UpsCharges> | null;
  /** The ratio added to each warehouse's UPS quotes overall (0 when surcharges are off or unknown). */
  upsUplift: Record<string, number>;
  /** The same per weight band, falling back to the overall ratio where a band has too few UPS packages. */
  upsUpliftByBand: Record<string, number[]>;
  /** Share of each warehouse's prepaid shipments per zone (sums to 1 per warehouse). */
  zoneMix: Record<string, Record<number, number>>;
  /** Share of UPS shipments to residential addresses, per warehouse. */
  resShare: Record<string, number>;
  /** Share of all shipments per warehouse. */
  originSplit: Record<string, number>;
  shipments: number;
};

type AggRow = { origin: string; zone: number; carrier: string; service: string; count: number; weight?: number };

/** The WEIGHT_BANDS index a billed weight falls in (the first band includes everything up to 1 lb). */
export function bandIndex(lb: number): number {
  const i = WEIGHT_BANDS.findIndex((b) => lb <= b.max);
  return i < 0 ? WEIGHT_BANDS.length - 1 : i;
}

/**
 * The share of UPS quotes to add for surcharges the quote doesn't include, from a warehouse's UPS charges:
 * everything except freight, residential (quoted for home addresses), handling by weight (over 50 lb, quoted by
 * weight) and, when the quotes include it, fuel, divided by what the quotes do cover.
 */
export function upsUpliftFrom(c: UpsChargeTotals | undefined, includesFuel: boolean): number {
  if (!c) return 0;
  const covered = c.freight + c.residential + (c.weightHandling ?? 0) + (includesFuel ? c.fuel : 0);
  const extra = c.other + (includesFuel ? 0 : c.fuel);
  if (covered <= 0) return 0;
  return Math.min(MAX_UPS_UPLIFT, Math.max(0, extra / covered));
}

/** Pure: mixes from the cost report's per-origin/zone/service(/weight) counts. */
export function mixFrom(
  rows: AggRow[],
  meta: { reportId: string; dateFrom: string | null; dateTo: string | null },
  opts: { blend?: BlendSettings; upsCharges?: Record<string, UpsCharges> | null } = {},
): MixData {
  const blend = opts.blend ?? { carrierMethod: "cheapest", upsSurcharges: false, upsQuotesIncludeFuel: true };
  const upsCharges = opts.upsCharges ?? null;
  const byOriginZone: Record<string, Record<number, number>> = {};
  const byOrigin: Record<string, number> = {};
  const res: Record<string, { res: number; com: number }> = {};
  const carrierMix: MixData["carrierMix"] = {};
  let total = 0;
  for (const r of rows) {
    if (!ZONES.includes(r.zone)) continue;
    (byOriginZone[r.origin] ??= {})[r.zone] = (byOriginZone[r.origin][r.zone] ?? 0) + r.count;
    byOrigin[r.origin] = (byOrigin[r.origin] ?? 0) + r.count;
    total += r.count;
    if (r.weight != null) {
      const m = (carrierMix[r.origin] ??= { ups: WEIGHT_BANDS.map(() => 0), usps: WEIGHT_BANDS.map(() => 0) });
      m[r.carrier === "USPS" ? "usps" : "ups"][bandIndex(r.weight)] += r.count;
    }
    if (r.carrier === "UPS") {
      const x = (res[r.origin] ??= { res: 0, com: 0 });
      if (r.service === "GROUND_RES") x.res += r.count;
      else x.com += r.count;
    }
  }
  const all = Object.values(res).reduce((a, x) => ({ res: a.res + x.res, com: a.com + x.com }), { res: 0, com: 0 });
  const overallRes = all.res + all.com ? all.res / (all.res + all.com) : 0.5;
  return {
    ...meta,
    blend,
    carrierMix,
    upsCharges,
    upsUplift: Object.fromEntries(Object.keys(byOrigin).map((o) => [o, blend.upsSurcharges ? upsUpliftFrom(upsCharges?.[o], blend.upsQuotesIncludeFuel) : 0])),
    upsUpliftByBand: Object.fromEntries(
      Object.keys(byOrigin).map((o) => {
        const c = upsCharges?.[o];
        const all = blend.upsSurcharges ? upsUpliftFrom(c, blend.upsQuotesIncludeFuel) : 0;
        return [o, WEIGHT_BANDS.map((b, i) => (b.min >= NO_UPS_SURCHARGE_FROM_LB ? 0 : blend.upsSurcharges && c?.bands?.[i] && c.bands[i].packages >= MIN_BAND_MIX_SHIPMENTS ? upsUpliftFrom(c.bands[i], blend.upsQuotesIncludeFuel) : all))];
      }),
    ),
    zoneMix:Object.fromEntries(Object.entries(byOriginZone).map(([o, z]) => [o, Object.fromEntries(Object.entries(z).map(([zone, n]) => [Number(zone), n / byOrigin[o]]))])),
    resShare: Object.fromEntries(Object.keys(byOrigin).map((o) => {
      const x = res[o];
      return [o, x && x.res + x.com >= MIN_ORIGIN_SHIPMENTS_FOR_RES_SHARE ? x.res / (x.res + x.com) : overallRes];
    })),
    originSplit: Object.fromEntries(Object.entries(byOrigin).map(([o, n]) => [o, n / total])),
    shipments: total,
  };
}

/** Mixes from the newest processed cost report, or null if there isn't one. */
export async function loadMix(): Promise<MixData | null> {
  const [report, s] = await Promise.all([
    prisma.shippingReport.findFirst({ where: { status: "READY" }, orderBy: { createdAt: "desc" }, select: { id: true, dateFrom: true, dateTo: true, summary: true } }),
    getSetting("shippingRates"),
  ]);
  if (!report) return null;
  const rows = await prisma.shippingHistoryAgg.groupBy({ by: ["origin", "zone", "carrier", "service", "weight"], where: { reportId: report.id }, _sum: { count: true } });
  const mix = mixFrom(
    rows.map((r) => ({ origin: r.origin, zone: r.zone, carrier: r.carrier, service: r.service, weight: Number(r.weight), count: r._sum.count ?? 0 })),
    { reportId: report.id, dateFrom: report.dateFrom?.toISOString() ?? null, dateTo: report.dateTo?.toISOString() ?? null },
    { blend: s.blend, upsCharges: (report.summary as ReportSummary | null)?.upsCharges ?? null },
  );
  return mix.shipments ? mix : null;
}

/**
 * The share of a warehouse's shipments at this billed weight that went USPS: its own split for the weight band
 * when it has enough shipments there, else the company's, else null (no data: the cheaper carrier is used).
 */
export function uspsShareFor(mix: Pick<MixData, "carrierMix">, origin: string, lb: number): number | null {
  const i = bandIndex(lb);
  const own = mix.carrierMix[origin];
  if (own && own.ups[i] + own.usps[i] >= MIN_BAND_MIX_SHIPMENTS) return own.usps[i] / (own.ups[i] + own.usps[i]);
  let ups = 0, usps = 0;
  for (const m of Object.values(mix.carrierMix)) {
    ups += m.ups[i];
    usps += m.usps[i];
  }
  return ups + usps >= MIN_BAND_MIX_SHIPMENTS ? usps / (ups + usps) : null;
}

// ─── Warehouse share ─────────────────────────────────────────────────────────

export type ShareBasis = "shipments" | "few-shipments" | "stock-one" | "stock-both" | "company";
export type WarehouseShare = { shares: Record<string, number>; basis: ShareBasis; label: string; understates: boolean };

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * How the product's orders split between warehouses:
 *  1. its own shipments last month (UPS and USPS), when there are at least 5;
 *  2. otherwise where it's stocked: one warehouse → 100% there; both → 100% from the one with the most stock
 *     (that's the warehouse that usually ships it);
 *  3. otherwise its few shipments, else the company-wide split.
 */
export function warehouseShare(inv: ItemInventory | null | undefined, mix: Pick<MixData, "originSplit">, origins: { code: string; name: string }[]): WarehouseShare {
  const name = (c: string) => origins.find((o) => o.code === c)?.name ?? c;
  const codes = origins.map((o) => o.code);
  const company = (label: string): WarehouseShare => {
    const known = codes.filter((c) => (mix.originSplit[c] ?? 0) > 0);
    const sum = known.reduce((a, c) => a + mix.originSplit[c], 0);
    return { shares: Object.fromEntries(known.map((c) => [c, mix.originSplit[c] / sum])), basis: "company", label, understates: false };
  };
  if (!inv || !inv.fetchedAt) return company(inv?.error ? `No Mango data (${inv.error}): company-wide split` : "No Mango data yet: company-wide split");

  const shipped = codes.filter((c) => (inv.shipments[c] ?? 0) > 0);
  const nShip = shipped.reduce((a, c) => a + inv.shipments[c], 0);
  const fromShipments = (basis: ShareBasis): WarehouseShare => {
    const shares = Object.fromEntries(shipped.map((c) => [c, inv.shipments[c] / nShip]));
    const top = shipped.sort((a, b) => shares[b] - shares[a])[0];
    const carriers = Object.entries(inv.shipmentCarriers ?? {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${n} ${c}`);
    const how = carriers.length > 1 ? ` (${carriers.join(", ")})` : carriers.length === 1 ? ` ${carriers[0].split(" ")[1]}` : "";
    const label = `${basis === "few-shipments" ? "From only" : "From"} ${nShip}${carriers.length === 1 ? how : ""} shipment${nShip === 1 ? "" : "s"} last month${carriers.length > 1 ? how : ""}: ${shipped.length === 1 ? `all ${name(top)}` : `${pct(shares[top])} ${name(top)}`}`;
    return { shares, basis, label, understates: false };
  };
  if (nShip >= MIN_OWN_SHIPMENTS) return fromShipments("shipments");

  const stocked = codes.filter((c) => (inv.stock[c]?.onHand ?? 0) > 0);
  if (stocked.length === 1) {
    return {
      shares: { [stocked[0]]: 1 },
      basis: "stock-one",
      label: `Stocked in ${name(stocked[0])} only (uses ${name(stocked[0])}'s usual zone mix, so it may understate the cost)`,
      understates: true,
    };
  }
  if (stocked.length > 1) {
    // the warehouse holding most of the stock usually ships the order
    const total = stocked.reduce((a, c) => a + inv.stock[c].onHand, 0);
    const ranked = [...stocked].sort((a, b) => inv.stock[b].onHand - inv.stock[a].onHand);
    if (inv.stock[ranked[0]].onHand === inv.stock[ranked[1]].onHand) return { ...company("Stocked equally in both: company-wide split"), basis: "stock-both" };
    const top = ranked[0];
    return {
      shares: { [top]: 1 },
      basis: "stock-both",
      label: `Stocked in both; ships from ${name(top)}, which has most of the stock (${pct(inv.stock[top].onHand / total)}). Uses ${name(top)}'s usual zone mix, so it may understate the cost`,
      understates: true,
    };
  }
  if (nShip > 0) return fromShipments("few-shipments");
  return company("No stock or shipment data in Mango: company-wide split");
}

// ─── The blend ───────────────────────────────────────────────────────────────

export type ProductRate = { origin: string; zone: number; service: string; amount: number | null };
export type BlendCell = { origin: string; zone: number; weight: number; cost: number | null };
export type BlendedCost = {
  cost: number | null;
  best: number | null;
  worst: number | null;
  /** Share of the weighting that had a price (below 80% the cost is flagged incomplete). */
  coverage: number;
  incomplete: boolean;
  share: WarehouseShare;
  /** How carriers were chosen, and each warehouse's USPS share when the actual carrier mix was used. */
  carrier: { method: CarrierMethod; uspsShare: Record<string, number | null>; upsUplift: Record<string, number> };
  cells: BlendCell[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const minOf = (...v: (number | null | undefined)[]) => {
  const xs = v.filter((x): x is number => x != null && Number.isFinite(x));
  return xs.length ? Math.min(...xs) : null;
};

/** Weighted average of two prices, falling back to whichever one exists. */
const mixOf = (share: number, a: number | null, b: number | null) => (a == null ? b : b == null ? a : share * a + (1 - share) * b);

/**
 * Cost of one warehouse/zone cell. UPS prices are first raised by `upsUplift` (surcharges the quotes leave out).
 *  - no `uspsShare` (cheapest carrier): the cheaper carrier for home and business addresses, weighted by the residential share;
 *  - with `uspsShare` (actual carrier mix): that share at the USPS price, the rest at UPS (residential/commercial blend).
 */
export function cellCost(
  prices: { usps: number | null; com: number | null; res: number | null },
  resShare: number,
  opts: { uspsShare?: number | null; upsUplift?: number } = {},
): number | null {
  const k = 1 + (opts.upsUplift ?? 0);
  const com = prices.com == null ? null : prices.com * k;
  const res = prices.res == null ? null : prices.res * k;
  if (opts.uspsShare != null) return mixOf(opts.uspsShare, prices.usps, mixOf(resShare, res, com));
  return mixOf(resShare, minOf(prices.usps, res), minOf(prices.usps, com));
}

/** How each warehouse's cells are priced for a product of this billed weight (null weight: cheapest carrier). */
function cellOpts(mix: MixData, origin: string, billedLb: number | null | undefined, method: CarrierMethod) {
  const upsUplift = billedLb == null ? (mix.upsUplift[origin] ?? 0) : (mix.upsUpliftByBand[origin]?.[bandIndex(billedLb)] ?? mix.upsUplift[origin] ?? 0);
  return { upsUplift, uspsShare: method === "actual-mix" && billedLb != null ? uspsShareFor(mix, origin, billedLb) : null };
}

export function blendedCost(rates: ProductRate[], mix: MixData, share: WarehouseShare, billedLb?: number | null): BlendedCost {
  const price = new Map(rates.map((r) => [`${r.origin}|${r.zone}|${r.service}`, r.amount]));
  const cells: BlendCell[] = [];
  let weighted = 0, covered = 0, totalWeight = 0;
  let best: number | null = null, worst: number | null = null;
  const carrier: BlendedCost["carrier"] = { method: mix.blend.carrierMethod, uspsShare: {}, upsUplift: {} };
  for (const [origin, s] of Object.entries(share.shares)) {
    if (s <= 0) continue;
    const opts = cellOpts(mix, origin, billedLb, mix.blend.carrierMethod);
    carrier.uspsShare[origin] = opts.uspsShare;
    carrier.upsUplift[origin] = opts.upsUplift;
    for (const zone of ZONES) {
      const w = s * (mix.zoneMix[origin]?.[zone] ?? 0);
      if (w <= 0) continue;
      const get = (svc: string) => price.get(`${origin}|${zone}|${svc}`) ?? null;
      const cost = cellCost({ usps: get("GROUND_ADVANTAGE"), com: get("GROUND_COM"), res: get("GROUND_RES") }, mix.resShare[origin] ?? 0.5, opts);
      cells.push({ origin, zone, weight: w, cost: cost == null ? null : round2(cost) });
      totalWeight += w;
      if (cost == null) continue;
      weighted += w * cost;
      covered += w;
      best = best == null ? cost : Math.min(best, cost);
      worst = worst == null ? cost : Math.max(worst, cost);
    }
  }
  const coverage = totalWeight ? covered / totalWeight : 0;
  return {
    cost: covered ? round2(weighted / covered) : null,
    best: best == null ? null : round2(best),
    worst: worst == null ? null : round2(worst),
    coverage: Math.round(coverage * 1000) / 1000,
    incomplete: coverage < COVERAGE_OK,
    share,
    carrier,
    cells,
  };
}

// ─── Reality check ───────────────────────────────────────────────────────────

export const WEIGHT_BANDS = [
  { label: "Under 1 lb", min: 0, max: 1 },
  { label: "1–5 lb", min: 1, max: 5 },
  { label: "5–10 lb", min: 5, max: 10 },
  { label: "10–20 lb", min: 10, max: 20 },
  { label: "20–50 lb", min: 20, max: 50 },
  { label: "50–150 lb", min: 50, max: 150 },
] as const;
export const MIN_BAND_SHIPMENTS = 20;
export const RELIABLE_PCT = 10;

type HistRow = { carrier: string; service: string; origin: string; zone: number; weight: number; count: number; total: number };
type ChartCell = { service: string; origin: string; zone: number; weight: number; amount: number | null };

/**
 * Checks the METHOD (not each product): for each weight band, the blended cost the chart gives for the
 * band's shipments vs what we actually paid per package for them. Model and actual use the same
 * shipments, so the difference is the method plus the chart against reality (surcharges, carrier choice).
 * Both carrier methods are worked out: "at our actual carrier mix" and "if everything went on the cheapest
 * carrier". The gap between them is what carrier choice cost over the report's period.
 */
export function realityCheck(history: HistRow[], chart: ChartCell[], mix: MixData) {
  const at = new Map(chart.map((c) => [`${c.service}|${c.origin}|${c.zone}|${c.weight}`, c.amount]));
  const modelAt = (lb: number, method: CarrierMethod) => {
    let sum = 0, w = 0;
    for (const [origin, s] of Object.entries(mix.originSplit)) {
      const opts = cellOpts(mix, origin, lb, method);
      for (const zone of ZONES) {
        const weight = s * (mix.zoneMix[origin]?.[zone] ?? 0);
        if (weight <= 0) continue;
        const u = upsTier(lb), p = uspsTier(lb);
        const cost = cellCost(
          { usps: at.get(`GROUND_ADVANTAGE|${origin}|${zone}|${p}`) ?? null, com: at.get(`GROUND_COM|${origin}|${zone}|${u}`) ?? null, res: at.get(`GROUND_RES|${origin}|${zone}|${u}`) ?? null },
          mix.resShare[origin] ?? 0.5,
          opts,
        );
        if (cost == null) continue;
        sum += weight * cost;
        w += weight;
      }
    }
    return w ? sum / w : null;
  };
  const cache = new Map<string, number | null>();
  const cached = (lb: number, method: CarrierMethod) => {
    const k = `${method}|${lb}`;
    if (!cache.has(k)) cache.set(k, modelAt(lb, method));
    return cache.get(k)!;
  };
  const pctOff = (model: number | null, actual: number | null, enough: boolean) => (enough && model != null && actual ? Math.round(((model - actual) / actual) * 1000) / 10 : null);
  const selected = mix.blend.carrierMethod;
  const bands = WEIGHT_BANDS.map((b, i) => {
    let n = 0, actual = 0;
    const sums = { "actual-mix": { total: 0, n: 0 }, cheapest: { total: 0, n: 0 } };
    let choice = 0;
    for (const r of history) {
      if (bandIndex(r.weight) !== i || r.weight > b.max) continue;
      n += r.count;
      actual += r.total;
      const m = cached(r.weight, "actual-mix");
      const c = cached(r.weight, "cheapest");
      if (m != null) {
        sums["actual-mix"].total += m * r.count;
        sums["actual-mix"].n += r.count;
      }
      if (c != null) {
        sums.cheapest.total += c * r.count;
        sums.cheapest.n += r.count;
      }
      if (m != null && c != null) choice += (m - c) * r.count;
    }
    const actualAvg = n ? actual / n : null;
    const avg = (k: CarrierMethod) => (sums[k].n ? sums[k].total / sums[k].n : null);
    const mixAvg = avg("actual-mix"), cheapAvg = avg("cheapest"), modelAvg = avg(selected);
    const enough = n >= MIN_BAND_SHIPMENTS && modelAvg != null && actualAvg != null;
    const r2 = (x: number | null) => (x == null ? null : round2(x));
    return {
      label: b.label,
      shipments: n,
      actual: r2(actualAvg),
      /** The selected method's cost (Settings), and its difference from what we paid. */
      model: r2(modelAvg),
      diffPct: pctOff(modelAvg, actualAvg, enough),
      actualMix: r2(mixAvg),
      actualMixPct: pctOff(mixAvg, actualAvg, n >= MIN_BAND_SHIPMENTS),
      cheapest: r2(cheapAvg),
      cheapestPct: pctOff(cheapAvg, actualAvg, n >= MIN_BAND_SHIPMENTS),
      /** What shipping at our actual carrier mix cost over the cheapest carrier, for the band's shipments. */
      carrierChoice: Math.round(choice),
      enough,
    };
  });
  const weighted = (pct: (b: (typeof bands)[number]) => number | null) => {
    const used = bands.filter((b) => pct(b) != null);
    const n = used.reduce((a, b) => a + b.shipments, 0);
    return n ? Math.round((used.reduce((a, b) => a + Math.abs(pct(b)!) * b.shipments, 0) / n) * 10) / 10 : null;
  };
  const overallPct = weighted((b) => (b.enough ? b.diffPct : null));
  const surcharge = mix.blend.upsSurcharges ? (mix.upsCharges ? "on" : "no-data") : "off";
  return {
    bands,
    overallPct,
    reliable: overallPct != null && overallPct <= RELIABLE_PCT,
    method: selected,
    actualMixPct: weighted((b) => b.actualMixPct),
    cheapestPct: weighted((b) => b.cheapestPct),
    carrierChoice: bands.reduce((a, b) => a + b.carrierChoice, 0),
    surcharge,
    upsUplift: mix.upsUplift,
    upsUpliftByBand: mix.upsUpliftByBand,
  };
}
export type RealityCheck = ReturnType<typeof realityCheck>;
