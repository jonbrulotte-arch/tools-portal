import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guard } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { errorMessage, jsonError, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PACKAGING_CATALOG_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { refreshAnalysisSoon } from "@/lib/packaging/jobs";
import { methodSchema } from "@/lib/packaging/schemas";

const duplicate = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await guard({ tool: PACKAGING_TOOL, permission: PACKAGING_CATALOG_PERMISSION });
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const body = await parseBody(req, methodSchema);
  if (body instanceof NextResponse) return body;
  const before = await prisma.packShippingMethod.findUnique({ where: { id } });
  if (!before) return jsonError("That shipping method no longer exists.", 404);
  try {
    const m = await prisma.packShippingMethod.update({ where: { id }, data: { ...body, notes: body.notes || null } });
    await logAudit({ action: "packaging.method_updated", category: "TOOL", actorId: user.id, actorEmail: user.email, targetType: "PackShippingMethod", targetId: id, metadata: { before, after: body } });
    refreshAnalysisSoon({ id: user.id, email: user.email });
    return NextResponse.json(m);
  } catch (err) {
    if (duplicate(err)) return jsonError(`There's already a shipping method called "${body.name}".`, 409);
    return jsonError(errorMessage(err), 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await guard({ tool: PACKAGING_TOOL, permission: PACKAGING_CATALOG_PERMISSION });
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const before = await prisma.packShippingMethod.findUnique({ where: { id }, include: { rates: true } });
  if (!before) return jsonError("That shipping method no longer exists.", 404);
  await prisma.packShippingMethod.delete({ where: { id } });
  await logAudit({ action: "packaging.method_deleted", category: "TOOL", actorId: user.id, actorEmail: user.email, targetType: "PackShippingMethod", targetId: id, metadata: { before } });
  refreshAnalysisSoon({ id: user.id, email: user.email });
  return NextResponse.json({ ok: true });
}
