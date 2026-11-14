import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { weightLabel } from "@/lib/shipping/weights";
import { SHIPPING_TOOL } from "@/lib/shipping/access";

const SERVICE: Record<string, string> = { GROUND_COM: "UPS Ground (commercial)", GROUND_RES: "UPS Ground (residential)", GROUND_ADVANTAGE: "USPS Ground Advantage" };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ tool: SHIPPING_TOOL });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const run = await prisma.shippingQuoteRun.findUnique({ where: { id } });
  if (!run) return jsonError("Quote run not found", 404);
  const quotes = await prisma.shippingQuote.findMany({ where: { runId: id }, orderBy: [{ origin: "asc" }, { carrier: "asc" }, { service: "asc" }, { zone: "asc" }, { weight: "asc" }] });
  await logAudit({ action: "shipping.quotes_exported", category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: "ShippingQuoteRun", targetId: id, metadata: { rows: quotes.length } });
  const csv = toCsv(
    ["mode", "origin", "service", "zone", "destination_zip", "weight", "weight_lb", "rate_usd", "list_rate_usd", "carrier_zone", "error"],
    quotes.map((q) => [run.mode, q.origin, SERVICE[q.service] ?? q.service, q.zone, q.destZip, weightLabel(Number(q.weight)), Number(q.weight), q.amount?.toString() ?? "", q.listAmount?.toString() ?? "", q.apiZone ?? "", q.error ?? ""]),
  );
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="shipping-quotes-${run.createdAt.toISOString().slice(0, 10)}-${run.mode}.csv"` } });
}
