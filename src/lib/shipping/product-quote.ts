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
// so both prices are for the same trip.

export type ProductQuoteInput = { partNumber: string; weight: number; dims: Dims | null; origins: string[]; runId?: string | null };
export type Service = QuoteRequest["service"];
export type ProductQuoteRow = {
  origin: string;
  zone: number;
  destZip: string;
  carrier: "UPS" | "USPS";
  service: Service;
  live: number | null;
  error: string | null;
  chart: number | null;
  chartWeight: number;
  diffPct: number | null;
};

const SERVICES: { carrier: "UPS" | "USPS"; service: Service }[] = [
  { carrier: "USPS", service: "GROUND_ADVANTAGE" },
  { carrier: "UPS", service: "GROUND_COM" },
  { carrier: "UPS", service: "GROUND_RES" },
];

export async function quoteProduct(s: ShippingRatesSettings, input: ProductQuoteInput) {
  const run = input.runId
    ? await prisma.shippingQuoteRun.findFirst({ where: { id: input.runId, status: "READY" } })
    : await prisma.shippingQuoteRun.findFirst({ where: { status: "READY" }, orderBy: { createdAt: "desc" } });
  const runZips = (run?.config as { quoteZips?: Record<string, Record<string, string>> } | null)?.quoteZips;
  const zips: Record<string, Record<string, string>> = runZips ?? quoteZipsFor(s, await latestZipSuggestions());
  const chartCells = run ? await loadQuotes(run.id) : [];
  const chart = new Map(chartCells.filter((c) => c.amount != null).map((c) => [[c.service, c.origin, c.zone, c.weight].join("|"), c.amount!]));

  const b = billable(input.weight, input.dims);
  const origins = s.origins.filter((o) => input.origins.includes(o.code));
  const jobs = origins.flatMap((o) =>
    ZONES.flatMap((zone) =>
      SERVICES.map((sv) => ({ origin: o, zone, destZip: zips[o.code]?.[String(zone)] ?? "", ...sv })),
    ),
  );

  const rows: ProductQuoteRow[] = new Array(jobs.length);
  const gate: ThrottleGate = {};
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const idx = next++;
      const j = jobs[idx];
      const chartWeight = j.carrier === "UPS" ? b.upsTier : b.uspsTier;
      const chartPrice = chart.get([j.service, j.origin.code, j.zone, chartWeight].join("|")) ?? null;
      const row: ProductQuoteRow = { origin: j.origin.code, zone: j.zone, destZip: j.destZip, carrier: j.carrier, service: j.service, live: null, error: null, chart: chartPrice, chartWeight, diffPct: null };
      const limit = j.carrier === "UPS" ? UPS_MAX_LB : USPS_MAX_LB;
      if ((j.carrier === "UPS" ? b.ups : b.usps) > limit) row.error = `Over the ${j.carrier} ${limit} lb limit`;
      else if (!j.destZip) row.error = "No destination ZIP for this zone";
      else {
        try {
          const r = await getQuoteWithRetry(s, s.mode, { carrier: j.carrier, service: j.service, origin: j.origin.code, originZip: j.origin.zip, destZip: j.destZip, zone: j.zone, weight: input.weight, dims: input.dims }, gate);
          row.live = r.amount;
          if (chartPrice) row.diffPct = Math.round(((r.amount - chartPrice) / chartPrice) * 1000) / 10;
        } catch (err) {
          row.error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
        }
      }
      rows[idx] = row;
    }
  };
  await Promise.all(Array.from({ length: s.mode === "live" ? 4 : 16 }, worker));

  return {
    mode: s.mode,
    run: run ? { id: run.id, mode: run.mode, createdAt: run.createdAt.toISOString() } : null,
    billable: b,
    rows,
  };
}

export type ProductQuoteResult = Awaited<ReturnType<typeof quoteProduct>>;
