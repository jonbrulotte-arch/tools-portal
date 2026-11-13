import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { getSetting } from "@/lib/settings";
import { crossovers, loadQuotes } from "@/lib/shipping/analysis";
import { RATE_CSV_HEADERS, rateCsvRows, rateRows } from "@/lib/shipping/rate-table";
import { SHIPPING_TOOL } from "@/lib/shipping/access";

// Rate-by-weight comparison (USPS Ground Advantage vs UPS Ground) as CSV. ?origin=LV&zone=8 limits it to one view.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ tool: SHIPPING_TOOL });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const run = await prisma.shippingQuoteRun.findUnique({ where: { id } });
  if (!run) return jsonError("Quote run not found", 404);
  const s = await getSetting("shippingRates");
  const url = new URL(req.url);
  const origin = url.searchParams.get("origin") || undefined;
  const zone = url.searchParams.get("zone") ? Number(url.searchParams.get("zone")) : undefined;
  if (origin && !s.origins.some((o) => o.code === origin)) return jsonError("Unknown warehouse", 400);
  if (zone !== undefined && !(Number.isInteger(zone) && zone >= 2 && zone <= 8)) return jsonError("Zone must be 2–8", 400);

  const quotes = await loadQuotes(id);
  const rows = rateRows(crossovers(quotes, s.origins.map((o) => o.code)), { origin, zone });
  await logAudit({ action: "shipping.rates_exported", category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: "ShippingQuoteRun", targetId: id, metadata: { origin: origin ?? "all", zone: zone ?? "all", rows: rows.length } });

  const scope = [origin, zone ? `zone${zone}` : null].filter(Boolean).join("-") || "all";
  const csv = toCsv(RATE_CSV_HEADERS, rateCsvRows(rows, run.mode, s.origins));
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="rate-by-weight-${scope}-${run.createdAt.toISOString().slice(0, 10)}-${run.mode}.csv"` },
  });
}
