import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { buildQuoteGrid, latestZipSuggestions } from "@/lib/shipping/runner";
import { loadQuotes } from "@/lib/shipping/analysis";
import { SHIPPING_TOOL } from "@/lib/shipping/access";
import { nextRun, SCHEDULE_TIMEZONES } from "@/lib/shipping/schedule";
import { QuotesClient } from "./quotes-client";

export const metadata: Metadata = { title: "Shipping quotes" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  await requireTool(SHIPPING_TOOL);
  const sp = await searchParams;
  const [settings, runs] = await Promise.all([getSetting("shippingRates"), prisma.shippingQuoteRun.findMany({ orderBy: { createdAt: "desc" }, take: 20 })]);
  const selected = runs.find((r) => r.id === sp.run) ?? runs.find((r) => r.status === "READY") ?? runs[0];
  const quotes = selected ? await loadQuotes(selected.id) : [];
  return (
    <QuotesClient
      mode={settings.mode}
      nightly={
        settings.schedule.enabled
          ? {
              next: nextRun(settings.schedule, new Date())?.toISOString() ?? null,
              timezone: settings.schedule.timezone,
              zoneLabel: SCHEDULE_TIMEZONES.find((t) => t.value === settings.schedule.timezone)?.label ?? settings.schedule.timezone,
            }
          : null
      }
      gridSize={buildQuoteGrid(settings, await latestZipSuggestions()).length}
      origins={settings.origins}
      runs={runs.map((r) => ({ id: r.id, mode: r.mode, status: r.status, total: r.total, done: r.done, failed: r.failed, error: r.error, startedBy: r.startedBy, createdAt: r.createdAt.toISOString(), startedAt: (r.startedAt ?? r.createdAt).toISOString(), startDone: r.startDone, finishedAt: r.finishedAt?.toISOString() ?? null }))}
      selectedId={selected?.id ?? null}
      quotes={quotes}
    />
  );
}
