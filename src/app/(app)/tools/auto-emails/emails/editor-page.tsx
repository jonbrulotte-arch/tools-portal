import { redirect } from "next/navigation";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { AUTO_EMAILS_EDIT, AUTO_EMAILS_TOOL } from "@/lib/auto-emails/access";
import { EmailEditor, type EditorEmail } from "./editor-client";

const BLANK: EditorEmail = {
  name: "",
  enabled: false,
  to: [],
  cc: [],
  subject: "",
  appendDate: true,
  introText: "Hello,\n\nPlease see the new records below.",
  sqlQuery: "SELECT TOP 100 *\nFROM dbo.YourTable\nWHERE CreatedDate >= DATEADD(day, -14, GETDATE())",
  keyColumns: [],
  closingText: "Thank you,",
};

/** Shared by /emails/new and /emails/[id]: managers only. */
export async function EditorPage({ id, created = false }: { id: string | null; created?: boolean }) {
  const user = await requireTool(AUTO_EMAILS_TOOL);
  if (!user.can(AUTO_EMAILS_EDIT)) {
    await logAudit({ action: "access.denied", category: "AUTH", actorId: user.id, actorEmail: user.email, success: false, metadata: { page: "auto-emails/editor", permission: AUTO_EMAILS_EDIT } });
    redirect("/tools/auto-emails");
  }
  const s = await getSetting("autoEmails");
  let initial = BLANK;
  let sentCount = 0;
  if (id) {
    const e = await prisma.autoEmail.findUnique({ where: { id } });
    if (!e) redirect("/tools/auto-emails");
    initial = { name: e.name, enabled: e.enabled, to: e.to, cc: e.cc, subject: e.subject, appendDate: e.appendDate, introText: e.introText, sqlQuery: e.sqlQuery, keyColumns: e.keyColumns, closingText: e.closingText };
    sentCount = await prisma.autoEmailSentKey.count({ where: { emailId: id } });
  }
  return <EmailEditor id={id} created={created} initial={initial} sentCount={sentCount} userEmail={user.email} dateFormat={s.dateFormat} timezone={s.timezone} maxRowsPerEmail={s.maxRowsPerEmail} intervalMinutes={s.intervalMinutes} />;
}
