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

export async function POST(req: Request) {
  const user = await guard({ tool: PACKAGING_TOOL, permission: PACKAGING_CATALOG_PERMISSION });
  if (user instanceof NextResponse) return user;
  const body = await parseBody(req, methodSchema);
  if (body instanceof NextResponse) return body;
  try {
    const m = await prisma.packShippingMethod.create({ data: { ...body, notes: body.notes || null } });
    await logAudit({ action: "packaging.method_created", category: "TOOL", actorId: user.id, actorEmail: user.email, targetType: "PackShippingMethod", targetId: m.id, metadata: { after: body } });
    refreshAnalysisSoon({ id: user.id, email: user.email });
    return NextResponse.json(m, { status: 201 });
  } catch (err) {
    if (duplicate(err)) return jsonError(`There's already a shipping method called "${body.name}".`, 409);
    return jsonError(errorMessage(err), 500);
  }
}
