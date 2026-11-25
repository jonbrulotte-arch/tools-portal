import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { AUTO_EMAILS_EDIT, AUTO_EMAILS_TOOL } from "@/lib/auto-emails/access";

// Forgets which records this email has sent, so the next run sends everything the query returns.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ tool: AUTO_EMAILS_TOOL, permission: AUTO_EMAILS_EDIT });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const email = await prisma.autoEmail.findUnique({ where: { id }, select: { name: true } });
  if (!email) return jsonError("Automated email not found", 404);
  const r = await prisma.autoEmailSentKey.deleteMany({ where: { emailId: id } });
  await logAudit({ action: "auto_email.sent_history_reset", category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: "AutoEmail", targetId: id, metadata: { name: email.name, forgotten: r.count } });
  return NextResponse.json({ ok: true, forgotten: r.count });
}
