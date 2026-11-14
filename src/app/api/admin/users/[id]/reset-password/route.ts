import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { jsonError, errorMessage } from "@/lib/api";
import { sendPasswordReset } from "@/lib/invites";
import { logAudit } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ permission: "admin.users" });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return jsonError("User not found", 404);
  if (user.status !== "ACTIVE") return jsonError("Password resets can only be sent to active users.");
  try {
    await sendPasswordReset(user);
  } catch (err) {
    await logAudit({ action: "user.password_reset_sent", category: "USER", actorId: actor.id, actorEmail: actor.email, targetType: "User", targetId: id, success: false, metadata: { error: errorMessage(err) } });
    return jsonError(errorMessage(err), 502);
  }
  await logAudit({ action: "user.password_reset_sent", category: "USER", actorId: actor.id, actorEmail: actor.email, targetType: "User", targetId: id, metadata: { email: user.email } });
  return NextResponse.json({ ok: true });
}
