import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PACKAGING_TOOL } from "@/lib/packaging/access";
import { latestReport } from "@/lib/packaging/jobs";
import { reportSheets, workbook } from "@/lib/packaging/io";
import { xlsxResponse } from "@/lib/packaging/http";

// The newest packaging analysis as a workbook.
export async function GET() {
  const user = await guard({ tool: PACKAGING_TOOL });
  if (user instanceof NextResponse) return user;
  const latest = await latestReport();
  if (!latest) return jsonError("There's no finished packaging analysis yet.", 404);
  const at = latest.run.finishedAt ?? latest.run.createdAt;
  await logAudit({ action: "packaging.report_exported", category: "TOOL", actorId: user.id, actorEmail: user.email, targetType: "PackAnalysisRun", targetId: latest.run.id });
  return xlsxResponse(await workbook(reportSheets(latest.report, at.toISOString())), `packaging-analysis-${at.toISOString().slice(0, 10)}.xlsx`);
}
