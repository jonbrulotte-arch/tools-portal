import { prisma } from "@/lib/prisma";
import type { ReportSummary } from "@/lib/shipping/report";
import { ZONES } from "@/lib/shipping/weights";

// Turns a processed report + a quote run into the three answers the tool exists for:
//  1. which zones we ship to most, 2. the weight where UPS Ground beats USPS Ground Advantage,
//  3. how close the quotes are to what we actually paid.

export type HistoryCell = { carrier: string; service: string; origin: string; zone: number; weight: number; count: number; avg: number; min: number; max: number; zoneSources: string[] };
export type QuoteCell = { carrier: string; service: string; origin: string; zone: number; weight: number; amount: number | null; listAmount: number | null; error: string | null; destZip: string; apiZone: string | null };

export async function loadHistory(reportId: string): Promise<HistoryCell[]> {
  const rows = await prisma.shippingHistoryAgg.findMany({ where: { reportId } });
  const m = new Map<string, HistoryCell & { total: number }>();
  for (const r of rows) {
    const weight = Number(r.weight);
    const k = [r.carrier, r.service, r.origin, r.zone, weight].join("|");
    const c = m.get(k) ?? { carrier: r.carrier, service: r.service, origin: r.origin, zone: r.zone, weight, count: 0, total: 0, avg: 0, min: Infinity, max: -Infinity, zoneSources: [] };
    c.count += r.count;
    c.total += Number(r.total);
    c.min = Math.min(c.min, Number(r.minCost));
    c.max = Math.max(c.max, Number(r.maxCost));
    if (!c.zoneSources.includes(r.zoneSource)) c.zoneSources.push(r.zoneSource);
    m.set(k, c);
  }
  return [...m.values()].map(({ total, ...c }) => ({ ...c, avg: Math.round((total / c.count) * 100) / 100 }));
}

export async function loadQuotes(runId: string): Promise<QuoteCell[]> {
  const rows = await prisma.shippingQuote.findMany({ where: { runId } });
  return rows.map((r) => ({
    carrier: r.carrier,
    service: r.service,
    origin: r.origin,
    zone: r.zone,
    weight: Number(r.weight),
    amount: r.amount == null ? null : Number(r.amount),
    listAmount: r.listAmount == null ? null : Number(r.listAmount),
    error: r.error,
    destZip: r.destZip,
    apiZone: r.apiZone,
  }));
}

// ─── 1. Zone usage ───────────────────────────────────────────────────────────

export function zoneUsage(summary: ReportSummary) {
  const byOrigin: Record<string, { zone: number; ups: number; usps: number; total: number }[]> = {};
  for (const u of summary.zoneUsage) {
    const list = (byOrigin[u.origin] ??= ZONES.map((zone) => ({ zone, ups: 0, usps: 0, total: 0 })));
    const row = list.find((r) => r.zone === u.zone);
    if (!row) continue;
    if (u.carrier === "UPS") row.ups += u.count;
    else row.usps += u.count;
    row.total += u.count;
  }
  const overall = ZONES.map((zone) => {
    const rows = Object.values(byOrigin).map((l) => l.find((r) => r.zone === zone)!);
    return { zone, ups: rows.reduce((s, r) => s + r.ups, 0), usps: rows.reduce((s, r) => s + r.usps, 0), total: rows.reduce((s, r) => s + r.total, 0) };
  });
  const top = (rows: { zone: number; total: number }[]) => rows.reduce((a, b) => (b.total > a.total ? b : a), rows[0]);
  return { byOrigin, overall, topOverall: top(overall), topByOrigin: Object.fromEntries(Object.entries(byOrigin).map(([o, rows]) => [o, top(rows)])) };
}

// ─── 2. UPS vs USPS cutoff ───────────────────────────────────────────────────

export type Crossover = {
  origin: string;
  zone: number;
  upsService: "GROUND_COM" | "GROUND_RES";
  /** Lightest whole-pound weight from which UPS is cheaper at every weight up to the USPS limit; null = USPS always cheaper. */
  cutoff: number | null;
  /** Weights where each carrier is cheaper (for the curve). */
  points: { weight: number; usps: number | null; ups: number | null }[];
};

/** A cutoff only counts when UPS stays cheaper for every heavier weight USPS still takes. */
export function findCutoff(points: { weight: number; usps: number | null; ups: number | null }[]): number | null {
  const comparable = points.filter((p) => p.weight >= 1 && p.usps != null && p.ups != null);
  let cutoff: number | null = null;
  for (let i = comparable.length - 1; i >= 0; i--) {
    if (comparable[i].ups! <= comparable[i].usps!) cutoff = comparable[i].weight;
    else break;
  }
  return cutoff;
}

export function crossovers(quotes: QuoteCell[], origins: string[]): Crossover[] {
  const price = new Map(quotes.filter((q) => q.amount != null).map((q) => [[q.carrier, q.service, q.origin, q.zone, q.weight].join("|"), q.amount!]));
  const uspsWeights = [...new Set(quotes.filter((q) => q.carrier === "USPS").map((q) => q.weight))].sort((a, b) => a - b);
  const out: Crossover[] = [];
  for (const origin of origins)
    for (const zone of ZONES)
      for (const upsService of ["GROUND_COM", "GROUND_RES"] as const) {
        const points = uspsWeights.map((weight) => ({
          weight,
          usps: price.get(["USPS", "GROUND_ADVANTAGE", origin, zone, weight].join("|")) ?? null,
          // UPS bills whole pounds: a sub-pound USPS tier compares with the UPS 1 lb price.
          ups: price.get(["UPS", upsService, origin, zone, Math.max(1, Math.ceil(weight))].join("|")) ?? null,
        }));
        out.push({ origin, zone, upsService, cutoff: findCutoff(points), points });
      }
  return out;
}

/** The same cutoff from what we actually paid (only weights with at least `minCount` shipments of each carrier). */
export function historicalCrossovers(history: HistoryCell[], origins: string[], minCount = 3) {
  const avg = (carrier: string, origin: string, zone: number, weight: number) => {
    const cells = history.filter((h) => h.carrier === carrier && h.origin === origin && h.zone === zone && h.weight === weight && (carrier === "USPS" || h.service !== ""));
    const n = cells.reduce((s, c) => s + c.count, 0);
    return n >= minCount ? cells.reduce((s, c) => s + c.avg * c.count, 0) / n : null;
  };
  return origins.flatMap((origin) =>
    ZONES.map((zone) => {
      const points = Array.from({ length: 20 }, (_, i) => i + 1).map((weight) => ({ weight, usps: avg("USPS", origin, zone, weight), ups: avg("UPS", origin, zone, weight) }));
      return { origin, zone, cutoff: findCutoff(points), points };
    }),
  );
}

// ─── 3. Quote accuracy ───────────────────────────────────────────────────────

export type AccuracyRow = HistoryCell & { quote: number; diff: number; pct: number };

export function accuracy(history: HistoryCell[], quotes: QuoteCell[]) {
  const price = new Map(quotes.filter((q) => q.amount != null).map((q) => [[q.carrier, q.service, q.origin, q.zone, q.weight].join("|"), q.amount!]));
  const rows: AccuracyRow[] = [];
  let unmatched = 0;
  for (const h of history) {
    const quote = price.get([h.carrier, h.service, h.origin, h.zone, h.weight].join("|"));
    if (quote == null) {
      unmatched += h.count;
      continue;
    }
    const diff = Math.round((quote - h.avg) * 100) / 100;
    rows.push({ ...h, quote, diff, pct: h.avg ? Math.round((diff / h.avg) * 1000) / 10 : 0 });
  }
  const summarize = (carrier: string) => {
    const r = rows.filter((x) => x.carrier === carrier);
    const n = r.reduce((s, x) => s + x.count, 0);
    if (!n) return null;
    const actual = r.reduce((s, x) => s + x.avg * x.count, 0);
    const quoted = r.reduce((s, x) => s + x.quote * x.count, 0);
    const absPct = r.reduce((s, x) => s + Math.abs(x.pct) * x.count, 0) / n;
    const within5 = r.filter((x) => Math.abs(x.pct) <= 5).reduce((s, x) => s + x.count, 0) / n;
    return { shipments: n, actual: Math.round(actual * 100) / 100, quoted: Math.round(quoted * 100) / 100, avgAbsPct: Math.round(absPct * 10) / 10, within5Pct: Math.round(within5 * 1000) / 10, overallPct: actual ? Math.round(((quoted - actual) / actual) * 1000) / 10 : 0 };
  };
  return { rows, unmatchedShipments: unmatched, ups: summarize("UPS"), usps: summarize("USPS") };
}
