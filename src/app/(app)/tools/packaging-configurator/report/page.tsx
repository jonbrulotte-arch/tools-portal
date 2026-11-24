import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { PACKAGING_RUN_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { jobStatus, latestReport } from "@/lib/packaging/jobs";
import { normalizeVerdict, type ReviewVerdict } from "@/lib/packaging/review";
import type { ProductResult } from "@/lib/packaging/report";
import { ReportClient, type GapKind, type GapRow } from "./report-client";

export const metadata: Metadata = { title: "Packaging report" };

const LIMIT = 500;

export default async function ReportPage() {
  const user = await requireTool(PACKAGING_TOOL);
  const [latest, status, s] = await Promise.all([latestReport(), jobStatus(), getSetting("packagingConfigurator")]);
  const r = latest?.report;
  const verdictOf = (x: ProductResult): ReviewVerdict | null => (x.review ? normalizeVerdict(x.review.verdict) : null);
  const saving = (x: ProductResult) => x.review?.savingRate ?? x.review?.savingLb ?? 0;

  // the lists only (the full product matrix is in the Excel export and on the Products tab)
  const gap = (pick: (x: ProductResult) => boolean, sort?: (a: ProductResult, b: ProductResult) => number) => {
    const all = (r?.results ?? []).filter(pick);
    if (sort) all.sort(sort);
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
          actualWeight: x.actualWeight,
          shippedDims: x.shippedDims,
          cheapest: x.cheapest,
          dimMethods: x.dimMethods,
          verdict: verdictOf(x),
          current: x.review?.current ?? null,
          savingRate: x.review?.savingRate ?? null,
          savingLb: x.review?.savingLb ?? null,
        }),
      ),
    };
  };
  const gaps: Record<GapKind, { total: number; rows: GapRow[] }> | null = r
    ? {
        better: gap((x) => verdictOf(x) === "better", (a, b) => saving(b) - saving(a)),
        expired: gap((x) => verdictOf(x) === "expired", (a, b) => saving(a) - saving(b)),
        data: gap((x) => verdictOf(x) === "undersized" || verdictOf(x) === "noPacked"),
        noFit: gap((x) => !x.shipsOwn && x.packagingId == null),
        loose: gap((x) => x.fitQuality === "loose" || x.fitQuality === "large"),
        dim: gap((x) => x.dimExposed),
        ok: gap((x) => verdictOf(x) === "ok"),
      }
    : null;
  const review = r?.review;
  const f = s.salsify.fields;
  // packaged fields that are the push's own properties: the comparison would only check our calculation against itself
  const pushed = new Set(Object.values(s.push.properties).map((x) => x.trim().toLowerCase()).filter(Boolean));
  const selfCompare = [f.packedLength, f.packedWidth, f.packedHeight, f.packedWeight].filter((x) => x && pushed.has(x.trim().toLowerCase()));
  return (
    <ReportClient
      report={
        r && latest && gaps
          ? {
              at: (latest.run.finishedAt ?? latest.run.createdAt).toISOString(),
              trigger: latest.run.trigger,
              summary: { products: r.products, incomplete: r.incomplete ?? 0, packaging: r.packaging, methods: r.methods, covered: r.covered, coverageRate: r.coverageRate, noFit: r.noFit, looseOnly: r.looseOnly, dimExposed: r.dimExposed, dimExposureRate: r.dimExposureRate },
              review: review ? { withPacked: review.withPacked, savingRate: review.savingRate, savingLb: review.savingLb } : null,
              settings: r.settings,
              packagingStats: r.packagingStats,
              dimByMethod: r.dimByMethod,
              typeBreakdown: r.typeBreakdown,
              gaps,
            }
          : null
      }
      packedFields={[f.packedLength, f.packedWidth, f.packedHeight, f.packedWeight].filter(Boolean)}
      selfCompare={selfCompare}
      status={status}
      canRun={user.can(PACKAGING_RUN_PERMISSION)}
    />
  );
}
