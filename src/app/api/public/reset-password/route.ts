import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { parseBody, jsonError } from "@/lib/api";
import { findValidReset } from "@/lib/tokens";
import { validatePassword } from "@/lib/invites";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const body = await parseBody(req, z.object({ token: z.string().min(10), password: z.string().max(200) }));
  if (body instanceof NextResponse) return body;
  const reset = await findValidReset(body.token);
  if (!reset) {
    await logAudit({ action: "auth.password_reset_failed", category: "AUTH", success: false, metadata: { reason: "invalid_or_expired_token" } });
    return jsonError("This reset link is invalid or has expired.", 410);
  }
  const pwError = validatePassword(body.password);
  if (pwError) return jsonError(pwError);
  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await bcrypt.hash(body.password, 12), failedLoginCount: 0, lockedUntil: null } }),
    prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
  ]);
  await logAudit({ action: "auth.password_reset", category: "AUTH", actorId: reset.userId, actorEmail: reset.user.email, targetType: "User", targetId: reset.userId });
  return NextResponse.json({ ok: true });
}
