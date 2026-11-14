import { prisma } from "@/lib/prisma";
import type { ShippingRatesSettings } from "@/lib/settings";
import { getQuoteWithRetry, type QuoteRequest, type ThrottleGate } from "@/lib/shipping/carriers";
import { loadQuotes } from "@/lib/shipping/analysis";
import { latestZipSuggestions, quoteZipsFor } from "@/lib/shipping/runner";
import { billable, UPS_MAX_LB, USPS_MAX_LB, type Dims } from "@/lib/shipping/dims";
import { ZONES } from "@/lib/shipping/weights";

// Quotes one product (real weight and size) from each chosen warehouse to every zone, for USPS
// Ground Advantage and UPS Ground (commercial and residential), and lines each price up with the
// rate chart (a quote run) at the product's billable weight. Uses the run's own destination ZIPs
// so both prices are for the same trip. Batches (the Products tab) load the context once and reuse it.

export type ProductQuoteInput = { partNumber: string; weight: number; dims: Dims | null; origins: string[]; runId?: string | null };
export type Service = QuoteRequest["service"];
export type ProductQuoteRow = {
  origin: string;
  zone: number;
  destZip: string;
  carrier: "UPS" | "USPS";
  service: Service;
  live: number | null;
  listAmount: number | null;
  negotiated: boolean | null;
  error: string | null;
  chart: number | null;
  chartWeight: number;
  diffPct: number | null;
};

export const PRODUCT_SERVICES: { carrier: "UPS" | "USPS"; service: Service }[] = [
  { carrier: "USPS", service: "GROUND_ADVANTAGE" },
  { carrier: "UPS", service: "GROUND_COM" },
  { carrier: "UPS", service: "GROUND_RES" },
];

/** The rate chart a product is compared with: a quote run, its destination ZIPs and its prices. */
export type QuoteContext = {
  run: { id: string; mode: string; createdAt: Date } | null;
  zips: Record<string, Record<string, string>>;
  chart: Map<string, number>;
};

export async function prepareQuoteContext(s: ShippingRatesSettings, runId?: string | null): Promise<QuoteContext> {
  const run = runId
    ? await prisma.shippingQuoteRun.findFirst({ where: { id: runId, status: "READY" } })
    : await prisma.shippingQuoteRun.findFirst({ where: { status: "READY" }, orderBy: { createdAt: "desc" } });
  const runZips = (run?.config as { quoteZips?: Record<string, Record<string, string>> } | null)?.quoteZips;
  const zips: Record<string, Record<string, string>> = runZips ?? quoteZipsFor(s, await latestZipSuggestions());
  const chartCells = run ? await loadQuotes(run.id) : [];
  const chart = new Map(chartCells.filter((c) => c.amount != null).map((c) => [[c.service, c.origin, c.zone, c.weight].join("|"), c.amount!]));
  return { run: run ? { id: run.id, mode: run.mode, createdAt: run.createdAt } : null, zips, chart };
}

/** Quotes one product against a prepared context; `gate` paces calls across a whole batch. */
export async function quoteProductWith(ctx: QuoteContext, s: ShippingRatesSettings, input: ProductQuoteInput, gate: ThrottleGate = {}) {
  const b = billable(input.weight, input.dims);
  const origins = s.origins.filter((o) => input.origins.includes(o.code));
  const jobs = origins.flatMap((o) => ZONES.flatMap((zone) => PRODUCT_SERVICES.map((sv) => ({ origin: o, zone, destZip: ctx.zips[o.code]?.[String(zone)] ?? "", ...sv }))));

  const rows: ProductQuoteRow[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const idx = next++;
      const j = jobs[idx];
      const chartWeight = j.carrier === "UPS" ? b.upsTier : b.uspsTier;
      const chartPrice = ctx.chart.get([j.service, j.origin.code, j.zone, chartWeight].join("|")) ?? null;
      const row: ProductQuoteRow = { origin: j.origin.code, zone: j.zone, destZip: j.destZip, carrier: j.carrier, service: j.service, live: null, listAmount: null, negotiated: null, error: null, chart: chartPrice, chartWeight, diffPct: null };
      const limit = j.carrier === "UPS" ? UPS_MAX_LB : USPS_MAX_LB;
      if ((j.carrier === "UPS" ? b.ups : b.usps) > limit) row.error = `Over the ${j.carrier} ${limit} lb limit`;
      else if (!j.destZip) row.error = "No destination ZIP for this zone";
      else {
        try {
          const r = await getQuoteWithRetry(s, s.mode, { carrier: j.carrier, service: j.service, origin: j.origin.code, originZip: j.origin.zip, destZip: j.destZip, zone: j.zone, weight: input.weight, dims: input.dims }, gate);
          row.live = r.amount;
          row.listAmount = r.listAmount ?? null;
          row.negotiated = r.negotiated ?? null;
          if (chartPrice) row.diffPct = Math.round(((r.amount - chartPrice) / chartPrice) * 1000) / 10;
        } catch (err) {
          row.error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
        }
      }
      rows[idx] = row;
    }
  };
  await Promise.all(Array.from({ length: s.mode === "live" ? 4 : 16 }, worker));
  return { billable: b, rows };
}

export async function quoteProduct(s: ShippingRatesSettings, input: ProductQuoteInput) {
  const ctx = await prepareQuoteContext(s, input.runId);
  const { billable: b, rows } = await quoteProductWith(ctx, s, input);
  return {
    mode: s.mode,
    run: ctx.run ? { id: ctx.run.id, mode: ctx.run.mode, createdAt: ctx.run.createdAt.toISOString() } : null,
    billable: b,
    rows,
  };
}

export type ProductQuoteResult = Awaited<ReturnType<typeof quoteProduct>>;
