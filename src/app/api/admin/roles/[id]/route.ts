import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { parseBody, jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { roleSchema } from "../schema";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ permission: "admin.roles" });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = await parseBody(req, roleSchema);
  if (body instanceof NextResponse) return body;
  const role = await prisma.role.findUnique({ where: { id }, include: { permissions: true, toolAccess: true } });
  if (!role) return jsonError("Role not found", 404);
  if (role.isSuperAdmin) return jsonError("The Super Admin role always has full access and can't be edited.", 403);
  if (role.isSystem && body.name !== role.name) return jsonError("System roles can't be renamed.");
  const clash = await prisma.role.findFirst({ where: { name: body.name, id: { not: id } } });
  if (clash) return jsonError("A role with that name already exists.", 409);
  if (actor.roleId === id && role.permissions.some((p) => p.permission === "admin.roles") && !body.permissions.includes("admin.roles")) {
    return jsonError("You can't remove 'Manage roles' from your own role.");
  }

  await prisma.$transaction([
    prisma.role.update({ where: { id }, data: { name: body.name, description: body.description } }),
    prisma.rolePermission.deleteMany({ where: { roleId: id } }),
    prisma.rolePermission.createMany({ data: body.permissions.map((permission) => ({ roleId: id, permission })) }),
    prisma.roleToolAccess.deleteMany({ where: { roleId: id } }),
    prisma.roleToolAccess.createMany({ data: body.toolIds.map((toolId) => ({ roleId: id, toolId })) }),
  ]);
  await logAudit({
    action: "role.updated",
    category: "ROLE",
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: "Role",
    targetId: id,
    metadata: {
      name: body.name,
      before: { permissions: role.permissions.map((p) => p.permission), toolIds: role.toolAccess.map((t) => t.toolId) },
      after: { permissions: body.permissions, toolIds: body.toolIds },
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ permission: "admin.roles" });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) return jsonError("Role not found", 404);
  if (role.isSystem) return jsonError("System roles can't be deleted.", 403);
  if (role._count.users > 0) return jsonError(`Move the ${role._count.users} user(s) in this role to another role first.`);
  await prisma.role.delete({ where: { id } });
  await logAudit({ action: "role.deleted", category: "ROLE", actorId: actor.id, actorEmail: actor.email, targetType: "Role", targetId: id, metadata: { name: role.name } });
  return NextResponse.json({ ok: true });
}
