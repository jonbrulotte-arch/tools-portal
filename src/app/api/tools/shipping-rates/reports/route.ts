import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { processReport } from "@/lib/shipping/report";
import { SHIPPING_TOOL } from "@/lib/shipping/access";

const MAX_BYTES = 80 * 1024 * 1024;

// Upload a Ship Cost History .xlsx; it's processed in the background into totals (no personal data kept).
export async function POST(req: Request) {
  const actor = await guard({ tool: SHIPPING_TOOL });
  if (actor instanceof NextResponse) return actor;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError("Choose the Ship Cost History .xlsx file to upload.");
  if (!/\.xlsx$/i.test(file.name)) return jsonError("The report must be an Excel .xlsx file.");
  if (file.size > MAX_BYTES) return jsonError("The file is larger than 80 MB.");
  const report = await prisma.shippingReport.create({ data: { fileName: file.name.slice(0, 200), uploadedById: actor.id, uploadedBy: actor.email } });
  const buffer = Buffer.from(await file.arrayBuffer());
  await logAudit({ action: "shipping.report_uploaded", category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: "ShippingReport", targetId: report.id, metadata: { fileName: file.name, bytes: file.size } });
  void processReport(report.id, buffer).catch((err) => console.error("[shipping] report processing failed", err));
  return NextResponse.json({ ok: true, id: report.id });
}
