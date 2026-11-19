import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { autoEmailSchema } from "@/lib/auto-emails/schemas";
import { AUTO_EMAILS_EDIT, AUTO_EMAILS_TOOL } from "@/lib/auto-emails/access";

// Creates an automated email.
export async function POST(req: Request) {
  const actor = await guard({ tool: AUTO_EMAILS_TOOL, permission: AUTO_EMAILS_EDIT });
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(req, autoEmailSchema);
  if (body instanceof NextResponse) return body;
  const email = await prisma.autoEmail.create({ data: { ...body, createdById: actor.id, updatedById: actor.id } });
  await logAudit({ action: "auto_email.created", category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: "AutoEmail", targetId: email.id, metadata: { name: email.name, enabled: email.enabled, to: email.to, cc: email.cc } });
  return NextResponse.json({ ok: true, id: email.id });
}
