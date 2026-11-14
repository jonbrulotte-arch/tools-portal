import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { sendInvite } from "@/lib/invites";
import { logAudit } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ permission: "admin.users" });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return jsonError("User not found", 404);
  if (user.status !== "INVITED") return jsonError("This user has already accepted their invite.");
  const { url, emailError } = await sendInvite(user, actor.name);
  await logAudit({ action: "user.invite_resent", category: "USER", actorId: actor.id, actorEmail: actor.email, targetType: "User", targetId: id, success: !emailError, metadata: { email: user.email, emailError } });
  return NextResponse.json({ ok: true, emailSent: !emailError, emailError, inviteUrl: emailError ? url : undefined });
}
