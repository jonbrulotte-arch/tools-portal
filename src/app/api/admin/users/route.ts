import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { parseBody, jsonError } from "@/lib/api";
import { sendInvite } from "@/lib/invites";
import { logAudit } from "@/lib/audit";

const inviteSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  email: z.string().email("Enter a valid email").max(254),
  roleId: z.string().min(1),
  toolIds: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  const actor = await guard({ permission: "admin.users" });
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(req, inviteSchema);
  if (body instanceof NextResponse) return body;
  const email = body.email.toLowerCase();

  if (await prisma.user.findUnique({ where: { email } })) return jsonError("A user with that email already exists.", 409);
  const role = await prisma.role.findUnique({ where: { id: body.roleId } });
  if (!role) return jsonError("Role not found");
  if (role.isSuperAdmin && !actor.isSuperAdmin) return jsonError("Only a Super Admin can invite Super Admins.", 403);

  const user = await prisma.user.create({
    data: {
      email,
      name: body.name,
      roleId: role.id,
      status: "INVITED",
      invitedById: actor.id,
      toolAccess: { create: body.toolIds.map((toolId) => ({ toolId, effect: "GRANT" as const })) },
    },
  });
  const { url, emailError } = await sendInvite(user, actor.name);
  await logAudit({
    action: "user.invited",
    category: "USER",
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: "User",
    targetId: user.id,
    success: !emailError,
    metadata: { email, name: body.name, role: role.name, toolIds: body.toolIds, emailSent: !emailError, emailError },
  });
  return NextResponse.json({ ok: true, id: user.id, emailSent: !emailError, emailError, inviteUrl: emailError ? url : undefined });
}
