import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guard } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { errorMessage, jsonError, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PACKAGING_PACKAGING_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { refreshAnalysisSoon } from "@/lib/packaging/jobs";
import { packagingSchema } from "@/lib/packaging/schemas";

const duplicate = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

export async function POST(req: Request) {
  const user = await guard({ tool: PACKAGING_TOOL, permission: PACKAGING_PACKAGING_PERMISSION });
  if (user instanceof NextResponse) return user;
  const body = await parseBody(req, packagingSchema);
  if (body instanceof NextResponse) return body;
  try {
    const p = await prisma.packPackaging.create({ data: { ...body, notes: body.notes || null } });
    await logAudit({ action: "packaging.packaging_created", category: "TOOL", actorId: user.id, actorEmail: user.email, targetType: "PackPackaging", targetId: p.id, metadata: { after: body } });
    refreshAnalysisSoon({ id: user.id, email: user.email });
    return NextResponse.json(p, { status: 201 });
  } catch (err) {
    if (duplicate(err)) return jsonError(`There's already packaging called "${body.name}".`, 409);
    return jsonError(errorMessage(err), 500);
  }
}
