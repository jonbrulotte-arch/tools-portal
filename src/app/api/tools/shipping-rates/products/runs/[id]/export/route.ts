import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { getSetting } from "@/lib/settings";
import { SHIPPING_TOOL } from "@/lib/shipping/access";

const SERVICE: Record<string, string> = { GROUND_COM: "UPS Ground (commercial)", GROUND_RES: "UPS Ground (residential)", GROUND_ADVANTAGE: "USPS Ground Advantage" };
const n = (d: unknown) => (d == null ? "" : String(d));

// One row per product × warehouse × zone × service (products without data get one row with the reason).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ tool: SHIPPING_TOOL });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const run = await prisma.productRateRun.findUnique({ where: { id } });
  if (!run) return jsonError("Products run not found", 404);
  const s = await getSetting("shippingRates");
  const originName = Object.fromEntries(s.origins.map((o) => [o.code, o.name]));
  const items = await prisma.productRateItem.findMany({ where: { runId: id }, orderBy: { position: "asc" }, include: { quotes: { orderBy: [{ origin: "asc" }, { zone: "asc" }, { service: "asc" }] } } });
  const rows: (string | number)[][] = [];
  for (const i of items) {
    const base = [run.mode, i.partNumber, i.name ?? "", n(i.weight), n(i.length), n(i.width), n(i.height), i.sizeSource ?? "", n(i.upsBillable), n(i.uspsBillable)];
    if (!i.quotes.length) rows.push([...base, "", "", "", "", "", "", "", "", "", i.status === "OK" ? "" : (i.error ?? i.status)]);
    for (const q of i.quotes) rows.push([...base, originName[q.origin] ?? q.origin, q.zone, q.destZip, SERVICE[q.service] ?? q.service, n(q.amount), n(q.listAmount), q.negotiated == null ? "" : q.negotiated ? "yes" : "no", n(q.chart), n(q.diffPct), q.error ?? ""]);
  }
  await logAudit({ action: "shipping.product_rates_exported", category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: "ProductRateRun", targetId: id, metadata: { products: items.length, rows: rows.length } });
  const csv = toCsv(
    ["mode", "part_number", "name", "weight_lb", "length_in", "width_in", "height_in", "size_source", "ups_billable_lb", "usps_billable_lb", "warehouse", "zone", "destination_zip", "service", "quote_usd", "list_usd", "negotiated", "rate_chart_usd", "difference_pct", "error"],
    rows,
  );
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="product-rates-${run.createdAt.toISOString().slice(0, 10)}-${run.mode}.csv"` } });
}
