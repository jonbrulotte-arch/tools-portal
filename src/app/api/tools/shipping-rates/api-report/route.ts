import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";
import { apiReportCsv, apiReportQuerySchema, apiUsageReport } from "@/lib/shipping/api-report";
import { flushApiUsage } from "@/lib/shipping/api-usage";

// Carrier API usage per account for a period (?from=YYYY-MM-DD&to=… or ?days=N); ?format=csv downloads it.
export async function GET(req: Request) {
  const actor = await guard({ tool: SHIPPING_TOOL, permission: SHIPPING_SETTINGS_PERMISSION });
  if (actor instanceof NextResponse) return actor;
  const parsed = apiReportQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid period");
  await flushApiUsage(); // include calls made in the last few seconds
  const report = await apiUsageReport(await getSetting("shippingRates"), parsed.data);
  if (parsed.data.format !== "csv") return NextResponse.json(report);
  await logAudit({ action: "shipping.api_report_exported", category: "TOOL", actorId: actor.id, actorEmail: actor.email, metadata: { from: report.from, to: report.to } });
  return new NextResponse(apiReportCsv(report), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="carrier-api-usage-${report.from}-to-${report.to}.csv"` },
  });
}
