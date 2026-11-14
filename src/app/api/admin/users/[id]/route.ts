import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { parseBody, jsonError } from "@/lib/api";
import { checkUserChange } from "@/lib/admin/users";
import { logAudit } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  roleId: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  unlock: z.boolean().optional(),
  toolOverrides: z.record(z.string(), z.enum(["GRANT", "DENY", "INHERIT"])).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ permission: "admin.users" });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = await parseBody(req, patchSchema);
  if (body instanceof NextResponse) return body;

  const before = await prisma.user.findUnique({ where: { id }, include: { toolAccess: true } });
  if (!before) return jsonError("User not found", 404);
  const problem = await checkUserChange(actor, id, { newRoleId: body.roleId, disable: body.status === "DISABLED" });
  if (problem) return jsonError(problem, 403);
  if (body.status === "ACTIVE" && !before.passwordHash) return jsonError("This user has not accepted their invite yet.");

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.roleId ? { roleId: body.roleId } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.unlock ? { lockedUntil: null, failedLoginCount: 0 } : {}),
      },
    });
    if (body.toolOverrides) {
      for (const [toolId, effect] of Object.entries(body.toolOverrides)) {
        if (effect === "INHERIT") await tx.userToolAccess.deleteMany({ where: { userId: id, toolId } });
        else await tx.userToolAccess.upsert({ where: { userId_toolId: { userId: id, toolId } }, create: { userId: id, toolId, effect }, update: { effect } });
      }
    }
  });

  const changes: Record<string, unknown> = {};
  if (body.name && body.name !== before.name) changes.name = { from: before.name, to: body.name };
  if (body.roleId && body.roleId !== before.roleId) changes.roleId = { from: before.roleId, to: body.roleId };
  if (body.status && body.status !== before.status) changes.status = { from: before.status, to: body.status };
  if (body.unlock) changes.unlocked = true;
  if (body.toolOverrides) changes.toolOverrides = body.toolOverrides;
  const action = body.status === "DISABLED" ? "user.disabled" : body.status === "ACTIVE" && before.status === "DISABLED" ? "user.enabled" : "user.updated";
  await logAudit({ action, category: "USER", actorId: actor.id, actorEmail: actor.email, targetType: "User", targetId: id, metadata: { email: before.email, changes } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ permission: "admin.users" });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const problem = await checkUserChange(actor, id, { remove: true });
  if (problem) return jsonError(problem, 403);
  const user = await prisma.user.delete({ where: { id } });
  await logAudit({ action: "user.deleted", category: "USER", actorId: actor.id, actorEmail: actor.email, targetType: "User", targetId: id, metadata: { email: user.email, name: user.name } });
  return NextResponse.json({ ok: true });
}
