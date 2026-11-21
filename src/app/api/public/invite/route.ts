import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { parseBody, jsonError } from "@/lib/api";
import { findValidInvite } from "@/lib/tokens";
import { validatePassword } from "@/lib/invites";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const body = await parseBody(req, z.object({ token: z.string().min(10), name: z.string().min(1).max(120), password: z.string().max(200) }));
  if (body instanceof NextResponse) return body;
  const invite = await findValidInvite(body.token);
  if (!invite) {
    await logAudit({ action: "user.invite_accept_failed", category: "AUTH", success: false, metadata: { reason: "invalid_or_expired_token" } });
    return jsonError("This invitation is invalid or has expired.", 410);
  }
  const pwError = validatePassword(body.password);
  if (pwError) return jsonError(pwError);
  await prisma.$transaction([
    prisma.user.update({ where: { id: invite.userId }, data: { name: body.name, passwordHash: await bcrypt.hash(body.password, 12), status: "ACTIVE" } }),
    prisma.inviteToken.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
  ]);
  await logAudit({ action: "user.invite_accepted", category: "USER", actorId: invite.userId, actorEmail: invite.user.email, targetType: "User", targetId: invite.userId });
  return NextResponse.json({ ok: true });
}
