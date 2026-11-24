import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { PACKAGING_SETTINGS_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { latestReport } from "@/lib/packaging/jobs";
import { normalizeVerdict } from "@/lib/packaging/review";
import { ReviewClient, type ReviewRow } from "./review-client";

export const metadata: Metadata = { title: "Packaging review" };

export default async function ReviewPage() {
  const user = await requireTool(PACKAGING_TOOL);
  const [latest, s] = await Promise.all([latestReport(), getSetting("packagingConfigurator")]);
  const r = latest?.report;
  const rows: ReviewRow[] = (r?.results ?? [])
    .filter((x) => x.review)
    .map((x) => ({
      partNumber: x.partNumber,
      name: x.name,
      verdict: normalizeVerdict(x.review!.verdict),
      current: x.review!.current,
      recommended: x.packagingName ? { name: x.packagingName, dims: x.shippedDims, billedWeight: x.billedWeight, cheapest: x.cheapest } : null,
      savingRate: x.review!.savingRate,
      savingLb: x.review!.savingLb,
    }));
  const f = s.salsify.fields;
  return (
    <ReviewClient
      rows={rows}
      summary={r?.review ? { ...r.review, counts: { ...r.review.counts, expired: r.review.counts.expired ?? (r.review.counts as Record<string, number>).currentBetter ?? 0 } } : null}
      products={r?.products ?? 0}
      at={latest ? (latest.run.finishedAt ?? latest.run.createdAt).toISOString() : null}
      fields={[f.packedLength, f.packedWidth, f.packedHeight, f.packedWeight].filter(Boolean)}
      canManage={user.can(PACKAGING_SETTINGS_PERMISSION)}
    />
  );
}
