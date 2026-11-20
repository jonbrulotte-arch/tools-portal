import { prisma } from "@/lib/prisma";
import { ZONES, upsTier, uspsTier } from "@/lib/shipping/weights";
import type { ItemInventory } from "@/lib/shipping/mango-inventory";

// Blended shipping cost: one expected cost per unit for a product that may ship from either warehouse.
//   cost = Σ warehouse share × Σ zone share (that warehouse's own zone mix) × cell cost
//   cell cost = residential share × min(USPS, UPS residential) + (1 − residential share) × min(USPS, UPS commercial)
// SIMPLE VERSION: a warehouse's zone mix is its historical mix, even for a product only one warehouse stocks
// (that warehouse then also covers customers the other one normally serves, so this understates their cost).
// The reality check below shows whether that matters.

export const MIN_OWN_SHIPMENTS = 5;
const MIN_ORIGIN_SHIPMENTS_FOR_RES_SHARE = 50;
const COVERAGE_OK = 0.8;

export type MixData = {
  reportId: string;
  dateFrom: string | null;
  dateTo: string | null;
  /** Share of each warehouse's prepaid shipments per zone (sums to 1 per warehouse). */
  zoneMix: Record<string, Record<number, number>>;
  /** Share of UPS shipments to residential addresses, per warehouse. */
  resShare: Record<string, number>;
  /** Share of all shipments per warehouse. */
  originSplit: Record<string, number>;
  shipments: number;
};

type AggRow = { origin: string; zone: number; carrier: string; service: string; count: number };

/** Pure: mixes from the cost report's per-origin/zone/service counts. */
export function mixFrom(rows: AggRow[], meta: { reportId: string; dateFrom: string | null; dateTo: string | null }): MixData {
  const byOriginZone: Record<string, Record<number, number>> = {};
  const byOrigin: Record<string, number> = {};
  const res: Record<string, { res: number; com: number }> = {};
  let total = 0;
  for (const r of rows) {
    if (!ZONES.includes(r.zone)) continue;
    (byOriginZone[r.origin] ??= {})[r.zone] = (byOriginZone[r.origin][r.zone] ?? 0) + r.count;
    byOrigin[r.origin] = (byOrigin[r.origin] ?? 0) + r.count;
    total += r.count;
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
    zoneMix: Object.fromEntries(Object.entries(byOriginZone).map(([o, z]) => [o, Object.fromEntries(Object.entries(z).map(([zone, n]) => [Number(zone), n / byOrigin[o]]))])),
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
  const report = await prisma.shippingReport.findFirst({ where: { status: "READY" }, orderBy: { createdAt: "desc" }, select: { id: true, dateFrom: true, dateTo: true } });
  if (!report) return null;
  const rows = await prisma.shippingHistoryAgg.groupBy({ by: ["origin", "zone", "carrier", "service"], where: { reportId: report.id }, _sum: { count: true } });
  const mix = mixFrom(rows.map((r) => ({ origin: r.origin, zone: r.zone, carrier: r.carrier, service: r.service, count: r._sum.count ?? 0 })), {
    reportId: report.id,
    dateFrom: report.dateFrom?.toISOString() ?? null,
    dateTo: report.dateTo?.toISOString() ?? null,
  });
  return mix.shipments ? mix : null;
}

// ─── Warehouse share ─────────────────────────────────────────────────────────

export type ShareBasis = "shipments" | "few-shipments" | "stock-one" | "stock-both" | "company";
export type WarehouseShare = { shares: Record<string, number>; basis: ShareBasis; label: string; understates: boolean };

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * How the product's orders split between warehouses: its own UPS shipments when there are enough,
 * otherwise where it's stocked, otherwise the company-wide split.
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
    const label = `${basis === "few-shipments" ? "From only" : "From"} ${nShip} UPS shipment${nShip === 1 ? "" : "s"} last month: ${shipped.length === 1 ? `all ${name(top)}` : `${pct(shares[top])} ${name(top)}`}`;
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
  if (stocked.length > 1) return { ...company("Stocked in both: company-wide split"), basis: "stock-both" };
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
  cells: BlendCell[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const minOf = (...v: (number | null | undefined)[]) => {
  const xs = v.filter((x): x is number => x != null && Number.isFinite(x));
  return xs.length ? Math.min(...xs) : null;
};

/** Cost of one warehouse/zone cell: the cheaper carrier for home and business addresses, weighted by the residential share. */
export function cellCost(prices: { usps: number | null; com: number | null; res: number | null }, resShare: number): number | null {
  const home = minOf(prices.usps, prices.res);
  const business = minOf(prices.usps, prices.com);
  if (home == null && business == null) return null;
  if (home == null) return business;
  if (business == null) return home;
  return resShare * home + (1 - resShare) * business;
}

export function blendedCost(rates: ProductRate[], mix: MixData, share: WarehouseShare): BlendedCost {
  const price = new Map(rates.map((r) => [`${r.origin}|${r.zone}|${r.service}`, r.amount]));
  const cells: BlendCell[] = [];
  let weighted = 0, covered = 0, totalWeight = 0;
  let best: number | null = null, worst: number | null = null;
  for (const [origin, s] of Object.entries(share.shares)) {
    if (s <= 0) continue;
    for (const zone of ZONES) {
      const w = s * (mix.zoneMix[origin]?.[zone] ?? 0);
      if (w <= 0) continue;
      const get = (svc: string) => price.get(`${origin}|${zone}|${svc}`) ?? null;
      const cost = cellCost({ usps: get("GROUND_ADVANTAGE"), com: get("GROUND_COM"), res: get("GROUND_RES") }, mix.resShare[origin] ?? 0.5);
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
 */
export function realityCheck(history: HistRow[], chart: ChartCell[], mix: MixData) {
  const at = new Map(chart.map((c) => [`${c.service}|${c.origin}|${c.zone}|${c.weight}`, c.amount]));
  const modelAt = (lb: number) => {
    let sum = 0, w = 0;
    for (const [origin, s] of Object.entries(mix.originSplit)) {
      for (const zone of ZONES) {
        const weight = s * (mix.zoneMix[origin]?.[zone] ?? 0);
        if (weight <= 0) continue;
        const u = upsTier(lb), p = uspsTier(lb);
        const cost = cellCost(
          { usps: at.get(`GROUND_ADVANTAGE|${origin}|${zone}|${p}`) ?? null, com: at.get(`GROUND_COM|${origin}|${zone}|${u}`) ?? null, res: at.get(`GROUND_RES|${origin}|${zone}|${u}`) ?? null },
          mix.resShare[origin] ?? 0.5,
        );
        if (cost == null) continue;
        sum += weight * cost;
        w += weight;
      }
    }
    return w ? sum / w : null;
  };
  const cache = new Map<number, number | null>();
  const bands = WEIGHT_BANDS.map((b) => {
    let n = 0, actual = 0, model = 0, modelled = 0;
    for (const r of history) {
      if (!(r.weight > b.min && r.weight <= b.max) && !(b.min === 0 && r.weight <= b.max)) continue;
      n += r.count;
      actual += r.total;
      if (!cache.has(r.weight)) cache.set(r.weight, modelAt(r.weight));
      const m = cache.get(r.weight);
      if (m != null) {
        model += m * r.count;
        modelled += r.count;
      }
    }
    const actualAvg = n ? actual / n : null;
    const modelAvg = modelled ? model / modelled : null;
    const enough = n >= MIN_BAND_SHIPMENTS && modelAvg != null && actualAvg != null;
    return { label: b.label, shipments: n, actual: actualAvg == null ? null : round2(actualAvg), model: modelAvg == null ? null : round2(modelAvg), diffPct: enough ? Math.round(((modelAvg! - actualAvg!) / actualAvg!) * 1000) / 10 : null, enough };
  });
  const used = bands.filter((b) => b.enough);
  const n = used.reduce((a, b) => a + b.shipments, 0);
  const overallPct = n ? Math.round((used.reduce((a, b) => a + Math.abs(b.diffPct!) * b.shipments, 0) / n) * 10) / 10 : null;
  return { bands, overallPct, reliable: overallPct != null && overallPct <= RELIABLE_PCT };
}
export type RealityCheck = ReturnType<typeof realityCheck>;
