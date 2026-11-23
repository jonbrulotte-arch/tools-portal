import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";
import { blendContext, blendFor, ratesForItems } from "@/lib/shipping/blended-view";

const BATCH = 200;
const n = (v: number | null | undefined) => (v == null ? "" : String(v));

/** One row per product: blended cost, range, warehouse split and how it was decided, stock and shipments. */
export async function blendedCsv(runId: string, mode: string, origins: { code: string; name: string }[]) {
  const items = await prisma.productRateItem.findMany({ where: { runId }, orderBy: { position: "asc" }, select: { id: true, partNumber: true, name: true, status: true, error: true, weight: true, upsBillable: true, uspsBillable: true } });
  const ctx = await blendContext(items.map((i) => i.partNumber));
  const rows: (string | number)[][] = [];
  for (let start = 0; start < items.length; start += BATCH) {
    const batch = items.slice(start, start + BATCH);
    const rates = await ratesForItems(batch.filter((i) => i.status === "OK").map((i) => i.id));
    for (const i of batch) {
      const b = i.status === "OK" ? blendFor(ctx, i.partNumber, rates.get(i.id) ?? [], i.upsBillable == null ? null : Number(i.upsBillable)) : null;
      rows.push([
        mode,
        i.partNumber,
        i.name ?? "",
        n(i.weight == null ? null : Number(i.weight)),
        n(i.upsBillable == null ? null : Number(i.upsBillable)),
        n(i.uspsBillable == null ? null : Number(i.uspsBillable)),
        n(b?.cost),
        n(b?.best),
        n(b?.worst),
        b ? (b.incomplete ? "yes" : "no") : "",
        ...origins.map((o) => (b ? Math.round((b.shares[o.code] ?? 0) * 1000) / 10 : "")),
        b?.basis ?? "",
        b?.label ?? (i.status === "OK" ? "No processed cost report yet" : (i.error ?? i.status)),
        ...origins.flatMap((o) => [n(b?.stock[o.code]?.onHand), n(b?.shipments[o.code] ?? (b ? 0 : null))]),
        b?.inventoryAsOf ?? "",
      ]);
    }
  }
  const csv = toCsv(
    [
      "mode",
      "part_number",
      "name",
      "weight_lb",
      "ups_billable_lb",
      "usps_billable_lb",
      "blended_cost_usd",
      "best_usd",
      "worst_usd",
      "incomplete",
      ...origins.map((o) => `${o.code}_share_pct`),
      "basis",
      "basis_detail",
      ...origins.flatMap((o) => [`${o.code}_on_hand`, `${o.code}_shipments_last_month`]),
      "inventory_read_at",
    ],
    rows,
  );
  return { csv, products: items.length };
}
