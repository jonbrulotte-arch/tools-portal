import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { accuracy, crossovers, historicalCrossovers, loadHistory, loadQuotes, zoneUsage } from "@/lib/shipping/analysis";
import type { ReportSummary } from "@/lib/shipping/report";
import { SHIPPING_TOOL } from "@/lib/shipping/access";
import { AnalysisClient } from "./analysis-client";

export const metadata: Metadata = { title: "Shipping rates analysis" };

export default async function ShippingAnalysisPage({ searchParams }: { searchParams: Promise<{ report?: string; run?: string }> }) {
  await requireTool(SHIPPING_TOOL);
  const sp = await searchParams;
  const [settings, reports, runs] = await Promise.all([
    getSetting("shippingRates"),
    prisma.shippingReport.findMany({ where: { status: "READY" }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, fileName: true, createdAt: true, dateFrom: true, dateTo: true, summary: true } }),
    prisma.shippingQuoteRun.findMany({ where: { status: "READY" }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, mode: true, createdAt: true, failed: true, total: true } }),
  ]);
  const report = reports.find((r) => r.id === sp.report) ?? reports[0];
  const run = runs.find((r) => r.id === sp.run) ?? runs[0];
  const origins = settings.origins.map((o) => o.code);
  const summary = (report?.summary as ReportSummary | null) ?? null;
  const [history, quotes] = await Promise.all([report ? loadHistory(report.id) : [], run ? loadQuotes(run.id) : []]);

  return (
    <AnalysisClient
      origins={settings.origins}
      reports={reports.map((r) => ({ id: r.id, label: `${r.fileName} (${r.dateFrom?.toISOString().slice(0, 10)} – ${r.dateTo?.toISOString().slice(0, 10)})` }))}
      runs={runs.map((r) => ({ id: r.id, label: `${r.createdAt.toISOString().slice(0, 16).replace("T", " ")} · ${r.mode === "live" ? "live" : "simulated"}`, mode: r.mode }))}
      reportId={report?.id ?? null}
      runId={run?.id ?? null}
      runMode={run?.mode ?? null}
      summary={summary ? { upsUsed: summary.ups.used, uspsUsed: summary.usps.used, dateFrom: report?.dateFrom?.toISOString() ?? null, dateTo: report?.dateTo?.toISOString() ?? null, spend: Math.round(summary.zoneUsage.reduce((s, u) => s + u.cost, 0)), zoneSources: summary.zoneSources } : null}
      usage={summary ? zoneUsage(summary) : null}
      crossovers={quotes.length ? crossovers(quotes, origins) : []}
      historical={history.length ? historicalCrossovers(history, origins) : []}
      accuracy={history.length && quotes.length ? accuracy(history, quotes) : null}
    />
  );
}
