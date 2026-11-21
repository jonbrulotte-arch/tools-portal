import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { parseBody, jsonError } from "@/lib/api";
import { validatePassword } from "@/lib/invites";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: Request) {
  const user = await guard();
  if (user instanceof NextResponse) return user;
  const body = await parseBody(
    req,
    z.object({ name: z.string().min(1).max(120).optional(), currentPassword: z.string().max(200).optional(), newPassword: z.string().max(200).optional() }),
  );
  if (body instanceof NextResponse) return body;

  if (body.name) {
    await prisma.user.update({ where: { id: user.id }, data: { name: body.name } });
    await logAudit({ action: "profile.name_changed", category: "USER", actorId: user.id, actorEmail: user.email, targetType: "User", targetId: user.id, metadata: { from: user.name, to: body.name } });
  }

  if (body.newPassword !== undefined) {
    const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!record.passwordHash || !(await bcrypt.compare(body.currentPassword ?? "", record.passwordHash))) {
      await logAudit({ action: "profile.password_change_failed", category: "AUTH", actorId: user.id, actorEmail: user.email, success: false, metadata: { reason: "bad_current_password" } });
      return jsonError("Current password is incorrect.");
    }
    const err = validatePassword(body.newPassword);
    if (err) return jsonError(err);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 12) } });
    await logAudit({ action: "profile.password_changed", category: "AUTH", actorId: user.id, actorEmail: user.email, targetType: "User", targetId: user.id });
  }
  return NextResponse.json({ ok: true });
}
