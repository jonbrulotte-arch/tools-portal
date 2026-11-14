import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ tool: SHIPPING_TOOL });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const r = await prisma.shippingReport.findUnique({ where: { id }, select: { id: true, status: true, progress: true, rowCount: true, error: true } });
  if (!r) return jsonError("Report not found", 404);
  return NextResponse.json(r);
}

// The uploader, or anyone who manages the tool's settings, can delete a report.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ tool: SHIPPING_TOOL });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const r = await prisma.shippingReport.findUnique({ where: { id } });
  if (!r) return jsonError("Report not found", 404);
  if (r.uploadedById !== actor.id && !actor.can(SHIPPING_SETTINGS_PERMISSION)) return jsonError("Only the person who uploaded it, or a settings manager, can delete this report.", 403);
  if (r.status === "RUNNING" || r.status === "PENDING") return jsonError("Wait for the report to finish processing.");
  await prisma.shippingReport.delete({ where: { id } });
  await logAudit({ action: "shipping.report_deleted", category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: "ShippingReport", targetId: id, metadata: { fileName: r.fileName } });
  return NextResponse.json({ ok: true });
}
