import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { historyWhere } from "@/lib/shopify/history";

export async function GET(req: Request) {
  const actor = await guard({ tool: "shopify-discounts" });
  if (actor instanceof NextResponse) return actor;
  const filters = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await prisma.shopifyDiscount.findMany({ where: historyWhere(actor, filters), include: { store: true }, orderBy: { createdAt: "desc" }, take: 50_000 });
  await logAudit({ action: "shopify.discounts_exported", category: "SHOPIFY", actorId: actor.id, actorEmail: actor.email, metadata: { filters, rows: rows.length } });
  const csv = toCsv(
    ["created_at", "store", "title", "type", "value", "codes", "starts_at", "ends_at", "status", "shopify_id", "created_by", "error"],
    rows.map((r) => [r.createdAt.toISOString(), r.store.name, r.title, r.valueType, r.value?.toString() ?? "", r.codes.join(" "), r.startsAt?.toISOString() ?? "", r.endsAt?.toISOString() ?? "", r.status, r.shopifyDiscountId, r.createdByEmail, r.errorMessage]),
  );
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="shopify-discounts-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
