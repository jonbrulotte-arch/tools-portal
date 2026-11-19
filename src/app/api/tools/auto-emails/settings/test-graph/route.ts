import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage } from "@/lib/api";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { sendGraphMail } from "@/lib/graph-mail";
import { graphConfigFrom } from "@/lib/auto-emails/runner";
import { AUTO_EMAILS_EDIT, AUTO_EMAILS_TOOL } from "@/lib/auto-emails/access";

// Sends a short test email from the tool's sender to the person clicking.
export async function POST() {
  const actor = await guard({ tool: AUTO_EMAILS_TOOL, permission: AUTO_EMAILS_EDIT });
  if (actor instanceof NextResponse) return actor;
  const s = await getSetting("autoEmails");
  try {
    const cfg = graphConfigFrom(s);
    await sendGraphMail(cfg, {
      to: [{ email: actor.email }],
      subject: "Automated Emails: test message",
      html: `<p style="font-family:Segoe UI,Arial,sans-serif">This is a test from Automated Emails (EDI). Microsoft Graph sent it as <b>${cfg.senderAddress}</b>, so automated emails can be delivered.</p>`,
    });
    await logAudit({ action: "auto_email.graph_tested", category: "TOOL", actorId: actor.id, actorEmail: actor.email, metadata: { ok: true, sender: cfg.senderAddress } });
    return NextResponse.json({ ok: true, message: `Test email sent from ${cfg.senderAddress} to ${actor.email}. Check your inbox.` });
  } catch (err) {
    await logAudit({ action: "auto_email.graph_tested", category: "TOOL", actorId: actor.id, actorEmail: actor.email, success: false, metadata: { error: errorMessage(err) } });
    return NextResponse.json({ ok: false, error: errorMessage(err) }, { status: 502 });
  }
}
