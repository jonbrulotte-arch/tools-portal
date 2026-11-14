import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { ReportSummary } from "@/lib/shipping/report";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";
import { getSetting } from "@/lib/settings";
import { rollingRange } from "@/lib/shipping/mango-import";
import { nextRun, timezoneLabel } from "@/lib/timezone";
import { ReportsClient } from "./reports-client";

export const metadata: Metadata = { title: "Shipping cost reports" };

export default async function ReportsPage() {
  const user = await requireTool(SHIPPING_TOOL);
  const [reports, settings] = await Promise.all([prisma.shippingReport.findMany({ orderBy: { createdAt: "desc" }, take: 50 }), getSetting("shippingRates")]);
  const m = settings.mangoImport;
  return (
    <ReportsClient
      currentUserId={user.id}
      canManage={user.can(SHIPPING_SETTINGS_PERMISSION)}
      mango={{
        defaultRange: rollingRange(m.days, new Date(), m.timezone),
        days: m.days,
        auto: m.enabled ? { frequency: m.frequency, next: nextRun(m, new Date())?.toISOString() ?? null, timezone: m.timezone, zoneLabel: timezoneLabel(m.timezone) } : null,
      }}
      reports={reports.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        uploadedBy: r.uploadedBy,
        uploadedById: r.uploadedById,
        status: r.status,
        error: r.error,
        progress: r.progress,
        rowCount: r.rowCount,
        dateFrom: r.dateFrom?.toISOString() ?? null,
        dateTo: r.dateTo?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        summary: (r.summary as ReportSummary | null) ?? null,
      }))}
    />
  );
}
