import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { loadQuotes, loadHistory } from "@/lib/shipping/analysis";
import { loadInventory, type ItemInventory } from "@/lib/shipping/mango-inventory";
import { blendedCost, loadMix, realityCheck, warehouseShare, type BilledWeights, type BlendCell, type BlendedCost, type MixData, type ProductRate } from "@/lib/shipping/blended-cost";

// Server-side reads that put the blended cost on screen: the per-product summary (Products table,
// detail dialog, CSV, Product quote) and the reality check card.

export type BlendSummary = {
  cost: number | null;
  best: number | null;
  worst: number | null;
  coverage: number;
  incomplete: boolean;
  basis: string;
  label: string;
  understates: boolean;
  shares: Record<string, number>;
  /** Carrier method used and each warehouse's USPS share / UPS surcharge ratio. */
  carrier: BlendedCost["carrier"];
  /** The cheaper carrier on average for this product (with each carrier's average). */
  cheapest: BlendedCost["cheapest"];
  stock: Record<string, { onHand: number; allocated: number }>;
  shipments: Record<string, number>;
  otherShipments: number;
  inventoryAsOf: string | null;
  inventoryError: string | null;
};
export type BlendDetail = BlendSummary & { cells: BlendCell[]; mixFrom: { dateFrom: string | null; dateTo: string | null } };

export type BlendContext = { mix: MixData | null; origins: { code: string; name: string }[]; inventory: Map<string, ItemInventory> };

export async function blendContext(parts: string[]): Promise<BlendContext> {
  const [mix, s, inventory] = await Promise.all([loadMix(), getSetting("shippingRates"), loadInventory(parts)]);
  return { mix, origins: s.origins, inventory };
}

/** A product's rate per warehouse/zone/service: the live quote, else the rate chart's price. */
export const rateOf = (q: { origin: string; zone: number; service: string; live: number | null; chart: number | null }): ProductRate => ({ origin: q.origin, zone: q.zone, service: q.service, amount: q.live ?? q.chart });

/** `weights`: the product's billable weight per carrier, which pick the weight bands for the carrier mix and UPS surcharges. */
export function blendFor(ctx: BlendContext, partNumber: string | null, rates: ProductRate[], weights: BilledWeights | null, inv?: ItemInventory | null): BlendDetail | null {
  if (!ctx.mix) return null;
  const item = inv !== undefined ? inv : partNumber ? (ctx.inventory.get(partNumber) ?? null) : null;
  const share = warehouseShare(item, ctx.mix, ctx.origins);
  const b = blendedCost(rates, ctx.mix, share, weights, item?.shipmentCarriers);
  return {
    cost: b.cost,
    best: b.best,
    worst: b.worst,
    coverage: b.coverage,
    incomplete: b.incomplete,
    basis: share.basis,
    label: share.label,
    understates: share.understates,
    shares: share.shares,
    carrier: b.carrier,
    cheapest: b.cheapest,
    stock: item?.stock ?? {},
    shipments: item?.shipments ?? {},
    otherShipments: item?.otherShipments ?? 0,
    inventoryAsOf: item?.fetchedAt ?? null,
    inventoryError: item?.error ?? null,
    cells: b.cells,
    mixFrom: { dateFrom: ctx.mix.dateFrom, dateTo: ctx.mix.dateTo },
  };
}

export const summaryOf = (d: BlendDetail | null): BlendSummary | null => {
  if (!d) return null;
  const { cells: _cells, mixFrom: _mix, ...rest } = d;
  void _cells;
  void _mix;
  return rest;
};

/** Stored quotes of a Products run's items, as rates per item id. */
export async function ratesForItems(itemIds: string[]): Promise<Map<string, ProductRate[]>> {
  const out = new Map<string, ProductRate[]>();
  if (!itemIds.length) return out;
  const quotes = await prisma.productRateQuote.findMany({ where: { itemId: { in: itemIds } }, select: { itemId: true, origin: true, zone: true, service: true, amount: true, chart: true } });
  for (const q of quotes) {
    const list = out.get(q.itemId) ?? [];
    list.push(rateOf({ origin: q.origin, zone: q.zone, service: q.service, live: q.amount == null ? null : Number(q.amount), chart: q.chart == null ? null : Number(q.chart) }));
    out.set(q.itemId, list);
  }
  return out;
}

/** The reality check card: newest cost report vs the newest finished quote run (live preferred). */
export async function loadRealityCheck() {
  const [mix, report, run, s] = await Promise.all([
    loadMix(),
    prisma.shippingReport.findFirst({ where: { status: "READY" }, orderBy: { createdAt: "desc" }, select: { id: true, dateFrom: true, dateTo: true } }),
    prisma.shippingQuoteRun.findFirst({ where: { status: "READY" }, orderBy: [{ mode: "asc" }, { createdAt: "desc" }], select: { id: true, mode: true, createdAt: true } }), // "live" sorts before "simulated"
    getSetting("shippingRates"),
  ]);
  if (!mix || !report || !run) return null;
  const [history, quotes] = await Promise.all([loadHistory(report.id), loadQuotes(run.id)]);
  const check = realityCheck(
    history.map((h) => ({ ...h, total: h.avg * h.count })),
    quotes.map((q) => ({ service: q.service, origin: q.origin, zone: q.zone, weight: q.weight, amount: q.amount })),
    mix,
  );
  return { ...check, reportFrom: report.dateFrom?.toISOString() ?? null, reportTo: report.dateTo?.toISOString() ?? null, runAt: run.createdAt.toISOString(), runMode: run.mode, origins: s.origins.map((o) => ({ code: o.code, name: o.name })) };
}
export type RealityCheckView = NonNullable<Awaited<ReturnType<typeof loadRealityCheck>>>;
