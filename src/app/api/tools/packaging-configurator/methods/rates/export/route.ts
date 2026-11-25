import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PACKAGING_TOOL } from "@/lib/packaging/access";
import { ratesSheet, workbook } from "@/lib/packaging/io";
import { today, xlsxResponse } from "@/lib/packaging/http";

export async function GET() {
  const user = await guard({ tool: PACKAGING_TOOL });
  if (user instanceof NextResponse) return user;
  const methods = await prisma.packShippingMethod.findMany({ include: { rates: { orderBy: { maxWeight: "asc" } } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const rows = methods.flatMap((m) => m.rates.map((r) => ({ method: m.name, maxWeight: r.maxWeight, rate: r.rate })));
  return xlsxResponse(await workbook([ratesSheet(rows)]), `shipping-rates-${today()}.xlsx`);
}
