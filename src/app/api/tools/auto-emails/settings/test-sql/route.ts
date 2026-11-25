import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage } from "@/lib/api";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { testConnection } from "@/lib/auto-emails/sql";
import { AUTO_EMAILS_EDIT, AUTO_EMAILS_TOOL } from "@/lib/auto-emails/access";

// Connects to SQL Server and reports its version and the current database.
export async function POST() {
  const actor = await guard({ tool: AUTO_EMAILS_TOOL, permission: AUTO_EMAILS_EDIT });
  if (actor instanceof NextResponse) return actor;
  const s = await getSetting("autoEmails");
  try {
    const r = await testConnection(s.sql);
    await logAudit({ action: "auto_email.sql_tested", category: "TOOL", actorId: actor.id, actorEmail: actor.email, metadata: { ok: true, server: s.sql.server, database: r.database } });
    return NextResponse.json({ ok: true, message: `Connected to ${s.sql.server}, database ${r.database}. ${r.version}` });
  } catch (err) {
    await logAudit({ action: "auto_email.sql_tested", category: "TOOL", actorId: actor.id, actorEmail: actor.email, success: false, metadata: { server: s.sql.server, error: errorMessage(err) } });
    return NextResponse.json({ ok: false, error: errorMessage(err) }, { status: 502 });
  }
}
