import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { parseBody } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { getSetting, setSetting, type AutoEmailSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { autoEmailSettingsSchema } from "@/lib/auto-emails/schemas";
import { resetSqlPool } from "@/lib/auto-emails/sql";
import { clearGraphTokenCache } from "@/lib/graph-mail";
import { AUTO_EMAILS_EDIT, AUTO_EMAILS_TOOL } from "@/lib/auto-emails/access";

const set = (v: string | null) => (v ? "set" : null);
const redact = (s: AutoEmailSettings) => ({
  ...s,
  graph: { ...s.graph, encTenantId: set(s.graph.encTenantId), encClientId: set(s.graph.encClientId), encClientSecret: set(s.graph.encClientSecret) },
  sql: { ...s.sql, encUser: set(s.sql.encUser), encPassword: set(s.sql.encPassword) },
});
/** A newly typed value is encrypted; blank keeps what's saved. */
const keepOr = (typed: string | undefined, saved: string | null) => (typed ? encrypt(typed) : saved);

export async function PATCH(req: Request) {
  const actor = await guard({ tool: AUTO_EMAILS_TOOL, permission: AUTO_EMAILS_EDIT });
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(req, autoEmailSettingsSchema);
  if (body instanceof NextResponse) return body;
  const before = await getSetting("autoEmails");
  const value: AutoEmailSettings = {
    enabled: body.enabled,
    intervalMinutes: body.intervalMinutes,
    maxRowsPerEmail: body.maxRowsPerEmail,
    keyRetentionDays: body.keyRetentionDays,
    logRetentionDays: body.logRetentionDays,
    dateFormat: body.dateFormat,
    timezone: body.timezone,
    graph: {
      encTenantId: keepOr(body.graph.tenantId, before.graph.encTenantId),
      encClientId: keepOr(body.graph.clientId, before.graph.encClientId),
      encClientSecret: body.graph.clearSecret ? null : body.graph.clientSecret ? encrypt(body.graph.clientSecret) : before.graph.encClientSecret,
      senderAddress: body.graph.senderAddress,
      senderName: body.graph.senderName,
    },
    sql: {
      server: body.sql.server,
      port: body.sql.port,
      database: body.sql.database,
      encUser: keepOr(body.sql.user, before.sql.encUser),
      encPassword: body.sql.clearPassword ? null : body.sql.password ? encrypt(body.sql.password) : before.sql.encPassword,
      encrypt: body.sql.encrypt,
      trustServerCertificate: body.sql.trustServerCertificate,
    },
  };
  await setSetting("autoEmails", value);
  if (JSON.stringify(value.sql) !== JSON.stringify(before.sql)) await resetSqlPool();
  if (JSON.stringify(value.graph) !== JSON.stringify(before.graph)) clearGraphTokenCache();
  await logAudit({ action: "auto_email.settings_updated", category: "SETTINGS", actorId: actor.id, actorEmail: actor.email, targetType: "Setting", targetId: "autoEmails", metadata: { before: redact(before), after: redact(value) } });
  return NextResponse.json({ ok: true });
}
