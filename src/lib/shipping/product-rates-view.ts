import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { zoneUsage } from "@/lib/shipping/analysis";
import { getSetting } from "@/lib/settings";
import type { ReportSummary } from "@/lib/shipping/report";

// Reads for the Products tab: runs, a page of products with a per-warehouse summary at that
// warehouse's most-used zone, and one product's full quote table.

export const PRODUCTS_PAGE_SIZE = 50;
export type ProductFilter = "all" | "ok" | "nodata" | "failed";

const num = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));

/** Each warehouse's most-used zone, from the newest processed cost report (zone 8 / zone 4 for us). */
export async function busiestZones(): Promise<Record<string, number>> {
  const r = await prisma.shippingReport.findFirst({ where: { status: "READY" }, orderBy: { createdAt: "desc" }, select: { summary: true } });
  if (!r?.summary) return {};
  const u = zoneUsage(r.summary as unknown as ReportSummary);
  return Object.fromEntries(Object.entries(u.topByOrigin).map(([o, t]) => [o, t.zone]));
}

export async function loadProductRuns() {
  const runs = await prisma.productRateRun.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  return runs.map((r) => ({
    id: r.id,
    mode: r.mode,
    status: r.status,
    listId: r.listId,
    total: r.total,
    done: r.done,
    failed: r.failed,
    error: r.error,
    startedBy: r.startedBy,
    createdAt: r.createdAt.toISOString(),
    startedAt: (r.startedAt ?? r.createdAt).toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  }));
}

export async function loadProductPage(runId: string, opts: { q?: string; filter?: ProductFilter; page?: number }, zones: Record<string, number>) {
  const where: Prisma.ProductRateItemWhereInput = { runId };
  const q = opts.q?.trim();
  if (q) where.OR = [{ partNumber: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }];
  if (opts.filter === "ok") where.status = "OK";
  if (opts.filter === "nodata") where.status = "NO_DATA";
  if (opts.filter === "failed") where.status = "FAILED";
  const page = Math.max(1, opts.page ?? 1);
  const [total, items, counts] = await Promise.all([
    prisma.productRateItem.count({ where }),
    prisma.productRateItem.findMany({ where, orderBy: { position: "asc" }, skip: (page - 1) * PRODUCTS_PAGE_SIZE, take: PRODUCTS_PAGE_SIZE }),
    prisma.productRateItem.groupBy({ by: ["status"], where: { runId }, _count: true }),
  ]);
  // prices at each warehouse's most-used zone, for the summary columns
  const pairs = Object.entries(zones);
  const quotes = items.length && pairs.length
    ? await prisma.productRateQuote.findMany({ where: { itemId: { in: items.map((i) => i.id) }, OR: pairs.map(([origin, zone]) => ({ origin, zone })) }, select: { itemId: true, origin: true, service: true, amount: true } })
    : [];
  const at = new Map(quotes.map((q) => [`${q.itemId}|${q.origin}|${q.service}`, num(q.amount)]));
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE)),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Partial<Record<"OK" | "NO_DATA" | "FAILED", number>>,
    items: items.map((i) => ({
      id: i.id,
      partNumber: i.partNumber,
      name: i.name,
      packaging: i.packaging,
      weight: num(i.weight),
      length: num(i.length),
      width: num(i.width),
      height: num(i.height),
      sizeSource: i.sizeSource,
      upsBillable: num(i.upsBillable),
      uspsBillable: num(i.uspsBillable),
      status: i.status,
      error: i.error,
      busiest: Object.fromEntries(
        pairs.map(([origin]) => [origin, { usps: at.get(`${i.id}|${origin}|GROUND_ADVANTAGE`) ?? null, com: at.get(`${i.id}|${origin}|GROUND_COM`) ?? null, res: at.get(`${i.id}|${origin}|GROUND_RES`) ?? null }]),
      ) as Record<string, { usps: number | null; com: number | null; res: number | null }>,
    })),
  };
}

export type ProductPage = Awaited<ReturnType<typeof loadProductPage>>;

/** One product's full quote table (for the detail dialog). */
export async function loadProductItem(id: string) {
  const [i, s] = await Promise.all([
    prisma.productRateItem.findUnique({ where: { id }, include: { quotes: { orderBy: [{ zone: "asc" }] }, run: { select: { mode: true, createdAt: true } } } }),
    getSetting("shippingRates"),
  ]);
  if (!i) return null;
  // warehouses in the order set in Settings (Las Vegas, then Groveport)
  const order = (code: string) => {
    const n = s.origins.findIndex((o) => o.code === code);
    return n < 0 ? 99 : n;
  };
  i.quotes.sort((a, b) => order(a.origin) - order(b.origin) || a.zone - b.zone);
  return {
    id: i.id,
    partNumber: i.partNumber,
    name: i.name,
    status: i.status,
    error: i.error,
    weight: num(i.weight),
    dims: i.length != null && i.width != null && i.height != null ? { length: num(i.length)!, width: num(i.width)!, height: num(i.height)! } : null,
    sizeSource: i.sizeSource,
    upsBillable: num(i.upsBillable),
    uspsBillable: num(i.uspsBillable),
    mode: i.run.mode,
    quotedAt: i.createdAt.toISOString(),
    rows: i.quotes.map((q) => ({ origin: q.origin, zone: q.zone, destZip: q.destZip, service: q.service, live: num(q.amount), chart: num(q.chart), diffPct: num(q.diffPct), error: q.error })),
  };
}
