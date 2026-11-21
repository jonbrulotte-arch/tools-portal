import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { jsonError, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { autoEmailSchema } from "@/lib/auto-emails/schemas";
import { AUTO_EMAILS_EDIT, AUTO_EMAILS_TOOL } from "@/lib/auto-emails/access";

type Ctx = { params: Promise<{ id: string }> };

/** The editable fields of an automated email. */
export async function GET(_req: Request, { params }: Ctx) {
  const actor = await guard({ tool: AUTO_EMAILS_TOOL, permission: AUTO_EMAILS_EDIT });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const e = await prisma.autoEmail.findUnique({ where: { id } });
  if (!e) return jsonError("Automated email not found", 404);
  return NextResponse.json({ name: e.name, enabled: e.enabled, to: e.to, cc: e.cc, subject: e.subject, appendDate: e.appendDate, introText: e.introText, sqlQuery: e.sqlQuery, keyColumns: e.keyColumns, closingText: e.closingText });
}

// Saves an automated email (all fields).
export async function PATCH(req: Request, { params }: Ctx) {
  const actor = await guard({ tool: AUTO_EMAILS_TOOL, permission: AUTO_EMAILS_EDIT });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const before = await prisma.autoEmail.findUnique({ where: { id } });
  if (!before) return jsonError("Automated email not found", 404);
  const body = await parseBody(req, autoEmailSchema);
  if (body instanceof NextResponse) return body;
  await prisma.autoEmail.update({ where: { id }, data: { ...body, updatedById: actor.id } });
  const changed = (Object.keys(body) as (keyof typeof body)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(body[k]));
  await logAudit({ action: "auto_email.updated", category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: "AutoEmail", targetId: id, metadata: { name: body.name, changed, enabled: body.enabled } });
  return NextResponse.json({ ok: true });
}

// Deletes an automated email and its sent-record history (its log entries are kept).
export async function DELETE(_req: Request, { params }: Ctx) {
  const actor = await guard({ tool: AUTO_EMAILS_TOOL, permission: AUTO_EMAILS_EDIT });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const email = await prisma.autoEmail.findUnique({ where: { id } });
  if (!email) return jsonError("Automated email not found", 404);
  await prisma.autoEmail.delete({ where: { id } });
  await logAudit({ action: "auto_email.deleted", category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: "AutoEmail", targetId: id, metadata: { name: email.name } });
  return NextResponse.json({ ok: true });
}
