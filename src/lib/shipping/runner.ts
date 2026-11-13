import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting, type ShippingRatesSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { getQuote, type QuoteRequest } from "@/lib/shipping/carriers";
import { representativeZips, type ZoneBands } from "@/lib/shipping/geo";
import type { ReportSummary } from "@/lib/shipping/report";
import { upsQuoteWeights, uspsQuoteWeights, ZONES } from "@/lib/shipping/weights";

// Builds the full quote grid (origins × zones 2–8 × weights × services) and runs it in the
// background. Live runs go a few requests at a time to stay inside carrier rate limits.

const LIVE_CONCURRENCY = 4;

export type ZipSuggestions = { fromReport: Record<string, Record<number, string>>; bands: Record<string, ZoneBands | null> };

/** Suggestions learned from the latest processed cost report (most-shipped city per zone, learned zone bands). */
export async function latestZipSuggestions(): Promise<ZipSuggestions> {
  const r = await prisma.shippingReport.findFirst({ where: { status: "READY" }, orderBy: { createdAt: "desc" }, select: { summary: true } });
  const sum = r?.summary as Partial<ReportSummary> | null;
  return { fromReport: sum?.suggestedQuoteZips ?? {}, bands: sum?.zoneBands ?? {} };
}

/** Automatic quote ZIP per origin/zone: the report's most-shipped city in that zone, else a ZIP mid-zone by distance. */
export function automaticZips(s: ShippingRatesSettings, sug: ZipSuggestions): Record<string, Record<number, string>> {
  return Object.fromEntries(
    s.origins.map((o) => {
      const byDistance = representativeZips(o.zip, sug.bands[o.code] ?? undefined);
      return [o.code, Object.fromEntries(ZONES.map((z) => [z, sug.fromReport[o.code]?.[z] || byDistance[z] || ""]))];
    }),
  );
}

/** Destination ZIP used to quote each origin/zone: a ZIP set in Settings, else the automatic choice. */
export function quoteZipsFor(s: ShippingRatesSettings, sug: ZipSuggestions): Record<string, Record<number, string>> {
  const auto = automaticZips(s, sug);
  return Object.fromEntries(s.origins.map((o) => [o.code, Object.fromEntries(ZONES.map((z) => [z, s.quoteZips[o.code]?.[String(z)] || auto[o.code][z]]))]));
}

export function buildQuoteGrid(s: ShippingRatesSettings, sug: ZipSuggestions): QuoteRequest[] {
  const zips = quoteZipsFor(s, sug);
  const out: QuoteRequest[] = [];
  for (const o of s.origins) {
    for (const zone of ZONES) {
      const destZip = zips[o.code][zone];
      if (!destZip) continue;
      for (const weight of uspsQuoteWeights(s.uspsMaxLb)) out.push({ carrier: "USPS", service: "GROUND_ADVANTAGE", origin: o.code, originZip: o.zip, destZip, zone, weight });
      for (const weight of upsQuoteWeights(s.upsMaxLb)) {
        out.push({ carrier: "UPS", service: "GROUND_COM", origin: o.code, originZip: o.zip, destZip, zone, weight });
        out.push({ carrier: "UPS", service: "GROUND_RES", origin: o.code, originZip: o.zip, destZip, zone, weight });
      }
    }
  }
  return out;
}

export async function startQuoteRun(actor: { id: string; email: string }) {
  const busy = await prisma.shippingQuoteRun.findFirst({ where: { status: { in: ["PENDING", "RUNNING"] } } });
  if (busy) throw new Error("A quote run is already in progress. Wait for it to finish or cancel it.");
  const s = await getSetting("shippingRates");
  const sug = await latestZipSuggestions();
  const grid = buildQuoteGrid(s, sug);
  const run = await prisma.shippingQuoteRun.create({
    data: {
      mode: s.mode,
      status: "PENDING",
      startedById: actor.id,
      startedBy: actor.email,
      total: grid.length,
      config: { origins: s.origins, quoteZips: quoteZipsFor(s, sug), uspsMaxLb: s.uspsMaxLb, upsMaxLb: s.upsMaxLb, upsApiVersion: s.ups.apiVersion, upsEnvironment: s.ups.environment } as Prisma.InputJsonValue,
    },
  });
  void executeRun(run.id, s, grid, actor);
  return run;
}

async function executeRun(runId: string, s: ShippingRatesSettings, grid: QuoteRequest[], actor: { id: string; email: string }) {
  await prisma.shippingQuoteRun.update({ where: { id: runId }, data: { status: "RUNNING" } });
  let done = 0, failed = 0, i = 0, cancelled = false;
  const concurrency = s.mode === "live" ? LIVE_CONCURRENCY : 32;
  const pending: Prisma.ShippingQuoteCreateManyInput[] = [];
  const flush = async () => {
    if (!pending.length) return;
    const batch = pending.splice(0, pending.length);
    await prisma.shippingQuote.createMany({ data: batch });
    const run = await prisma.shippingQuoteRun.update({ where: { id: runId }, data: { done, failed } });
    if (run.status === "CANCELLED") cancelled = true;
  };
  const worker = async () => {
    while (!cancelled && i < grid.length) {
      const q = grid[i++];
      const base = { runId, carrier: q.carrier, service: q.service, origin: q.origin, zone: q.zone, destZip: q.destZip, weight: new Prisma.Decimal(q.weight) };
      try {
        const r = await getQuote(s, s.mode, q);
        pending.push({ ...base, amount: new Prisma.Decimal(r.amount), listAmount: r.listAmount != null ? new Prisma.Decimal(r.listAmount) : null, apiZone: r.apiZone ?? null });
      } catch (err) {
        failed++;
        pending.push({ ...base, error: (err instanceof Error ? err.message : String(err)).slice(0, 500) });
      }
      done++;
      if (pending.length >= (s.mode === "live" ? 20 : 500)) await flush();
    }
  };
  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
    await flush();
    const status = cancelled ? "CANCELLED" : failed === done && done > 0 ? "FAILED" : "READY";
    await prisma.shippingQuoteRun.update({
      where: { id: runId },
      data: { status, done, failed, finishedAt: new Date(), error: status === "FAILED" ? "Every quote failed; see the errors in the quote table." : null },
    });
    await logAudit({ action: `shipping.quote_run_${status.toLowerCase()}`, category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: "ShippingQuoteRun", targetId: runId, success: status !== "FAILED", metadata: { mode: s.mode, total: grid.length, done, failed }, ip: null, userAgent: null });
  } catch (err) {
    await prisma.shippingQuoteRun.update({ where: { id: runId }, data: { status: "FAILED", error: err instanceof Error ? err.message : String(err), finishedAt: new Date(), done, failed } });
  }
}

/** After a restart, jobs that were running in the old process can't finish. */
export async function failInterruptedJobs() {
  const msg = "Interrupted by a server restart; start it again.";
  await prisma.shippingQuoteRun.updateMany({ where: { status: { in: ["PENDING", "RUNNING"] } }, data: { status: "FAILED", error: msg, finishedAt: new Date() } });
  await prisma.shippingReport.updateMany({ where: { status: { in: ["PENDING", "RUNNING"] } }, data: { status: "FAILED", error: msg, finishedAt: new Date() } });
}
