import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { PACKAGING_TOOL } from "@/lib/packaging/access";
import { BULK_TEMPLATE, ITEMS_TEMPLATE, PACKAGING_TEMPLATE, RATES_TEMPLATE, workbook } from "@/lib/packaging/io";
import { xlsxResponse } from "@/lib/packaging/http";

const TEMPLATES = { configurator: ITEMS_TEMPLATE, bulk: BULK_TEMPLATE, packaging: PACKAGING_TEMPLATE, rates: RATES_TEMPLATE } as const;

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await guard({ tool: PACKAGING_TOOL });
  if (user instanceof NextResponse) return user;
  const { kind } = await params;
  if (!(kind in TEMPLATES)) return jsonError("Unknown template", 404);
  return xlsxResponse(await workbook([TEMPLATES[kind as keyof typeof TEMPLATES]]), `${kind}-template.xlsx`);
}
