import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { parseBody, jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { roleSchema } from "./schema";

export async function POST(req: Request) {
  const actor = await guard({ permission: "admin.roles" });
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(req, roleSchema);
  if (body instanceof NextResponse) return body;
  if (await prisma.role.findUnique({ where: { name: body.name } })) return jsonError("A role with that name already exists.", 409);
  const role = await prisma.role.create({
    data: {
      name: body.name,
      description: body.description,
      permissions: { create: body.permissions.map((permission) => ({ permission })) },
      toolAccess: { create: body.toolIds.map((toolId) => ({ toolId })) },
    },
  });
  await logAudit({ action: "role.created", category: "ROLE", actorId: actor.id, actorEmail: actor.email, targetType: "Role", targetId: role.id, metadata: body });
  return NextResponse.json({ ok: true, id: role.id });
}
