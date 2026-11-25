import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/rbac";
import { parseBody, jsonError, errorMessage } from "@/lib/api";
import { sendMail } from "@/lib/graph-mail";
import { getBranding } from "@/lib/settings";
import { testEmail } from "@/lib/email-templates";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const actor = await guard({ permission: "admin.settings" });
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(req, z.object({ to: z.string().email() }));
  if (body instanceof NextResponse) return body;
  const { subject, html } = testEmail(await getBranding());
  try {
    await sendMail({ email: body.to }, subject, html);
  } catch (err) {
    await logAudit({ action: "settings.email_test", category: "SETTINGS", actorId: actor.id, actorEmail: actor.email, success: false, metadata: { to: body.to, error: errorMessage(err) } });
    return jsonError(errorMessage(err), 502);
  }
  await logAudit({ action: "settings.email_test", category: "SETTINGS", actorId: actor.id, actorEmail: actor.email, metadata: { to: body.to } });
  return NextResponse.json({ ok: true });
}
