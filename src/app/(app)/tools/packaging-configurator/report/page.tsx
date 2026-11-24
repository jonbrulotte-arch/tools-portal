import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { PACKAGING_SETTINGS_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { jobStatus, latestReport } from "@/lib/packaging/jobs";
import { ReportClient, type GapRow } from "./report-client";

export const metadata: Metadata = { title: "Packaging report" };

const LIMIT = 500;

export default async function ReportPage() {
  const user = await requireTool(PACKAGING_TOOL);
  const [latest, status] = await Promise.all([latestReport(), jobStatus()]);
  const r = latest?.report;
  // the gap lists only (the full product matrix is in the Excel export and on the Products tab)
  const gap = (pick: (x: NonNullable<typeof r>["results"][number]) => boolean) => {
    const all = (r?.results ?? []).filter(pick);
    return {
      total: all.length,
      rows: all.slice(0, LIMIT).map(
        (x): GapRow => ({
          partNumber: x.partNumber,
          name: x.name,
          dims: `${x.length} × ${x.width} × ${x.height}`,
          weight: x.weight,
          foldable: x.foldable,
          packaging: x.packagingName,
          fit: x.fitQuality,
          utilization: x.volumeUtilization,
          billedWeight: x.billedWeight,
          dimMethods: x.dimMethods,
        }),
      ),
    };
  };
  return (
    <ReportClient
      report={
        r && latest
          ? {
              at: (latest.run.finishedAt ?? latest.run.createdAt).toISOString(),
              trigger: latest.run.trigger,
              summary: { products: r.products, incomplete: r.incomplete ?? 0, packaging: r.packaging, methods: r.methods, covered: r.covered, coverageRate: r.coverageRate, noFit: r.noFit, looseOnly: r.looseOnly, dimExposed: r.dimExposed, dimExposureRate: r.dimExposureRate },
              settings: r.settings,
              packagingStats: r.packagingStats,
              dimByMethod: r.dimByMethod,
              typeBreakdown: r.typeBreakdown,
              gaps: {
                noFit: gap((x) => !x.shipsOwn && x.packagingId == null),
                loose: gap((x) => x.fitQuality === "loose" || x.fitQuality === "large"),
                dim: gap((x) => x.dimExposed),
              },
            }
          : null
      }
      status={status}
      canRun={user.can(PACKAGING_SETTINGS_PERMISSION)}
    />
  );
}
