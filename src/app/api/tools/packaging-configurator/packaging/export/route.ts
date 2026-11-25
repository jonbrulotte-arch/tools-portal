import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PACKAGING_TOOL } from "@/lib/packaging/access";
import { packagingSheet, workbook } from "@/lib/packaging/io";
import { today, xlsxResponse } from "@/lib/packaging/http";
import type { PackagingType } from "@/lib/packaging/engine";

export async function GET() {
  const user = await guard({ tool: PACKAGING_TOOL });
  if (user instanceof NextResponse) return user;
  const rows = await prisma.packPackaging.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] });
  return xlsxResponse(await workbook([packagingSheet(rows.map((r) => ({ ...r, type: r.type as PackagingType })))]), `packaging-${today()}.xlsx`);
}
