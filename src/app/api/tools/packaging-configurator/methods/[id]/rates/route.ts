import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { jsonError, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PACKAGING_CATALOG_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { refreshAnalysisSoon } from "@/lib/packaging/jobs";
import { ratesSchema } from "@/lib/packaging/schemas";

// Replaces one method's whole rate card.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await guard({ tool: PACKAGING_TOOL, permission: PACKAGING_CATALOG_PERMISSION });
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const body = await parseBody(req, ratesSchema);
  if (body instanceof NextResponse) return body;
  const method = await prisma.packShippingMethod.findUnique({ where: { id }, include: { rates: { orderBy: { maxWeight: "asc" } } } });
  if (!method) return jsonError("That shipping method no longer exists.", 404);
  await prisma.$transaction([
    prisma.packShippingRate.deleteMany({ where: { methodId: id } }),
    prisma.packShippingRate.createMany({ data: body.rates.map((r) => ({ methodId: id, maxWeight: r.maxWeight, rate: r.rate })) }),
    prisma.packShippingMethod.update({ where: { id }, data: { updatedAt: new Date() } }),
  ]);
  await logAudit({ action: "packaging.rates_updated", category: "TOOL", actorId: user.id, actorEmail: user.email, targetType: "PackShippingMethod", targetId: id, metadata: { method: method.name, before: method.rates.map((r) => [r.maxWeight, r.rate]), after: body.rates.map((r) => [r.maxWeight, r.rate]) } });
  refreshAnalysisSoon({ id: user.id, email: user.email });
  return NextResponse.json({ ok: true, rates: [...body.rates].sort((a, b) => a.maxWeight - b.maxWeight) });
}
