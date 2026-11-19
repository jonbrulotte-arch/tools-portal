import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireTool } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { AUTO_EMAILS_EDIT, AUTO_EMAILS_TOOL } from "@/lib/auto-emails/access";
import { savedHint } from "@/lib/auto-emails/saved-hint";
import { AutoEmailSettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Automated email settings" };

export default async function AutoEmailSettingsPage() {
  const user = await requireTool(AUTO_EMAILS_TOOL);
  if (!user.can(AUTO_EMAILS_EDIT)) {
    await logAudit({ action: "access.denied", category: "AUTH", actorId: user.id, actorEmail: user.email, success: false, metadata: { page: "auto-emails/settings", permission: AUTO_EMAILS_EDIT } });
    redirect("/tools/auto-emails");
  }
  const s = await getSetting("autoEmails");
  return (
    <AutoEmailSettingsClient
      userEmail={user.email}
      initial={{
        enabled: s.enabled,
        intervalMinutes: ([5, 15, 30, 60].includes(s.intervalMinutes) ? s.intervalMinutes : 15) as 5 | 15 | 30 | 60,
        maxRowsPerEmail: s.maxRowsPerEmail,
        keyRetentionDays: s.keyRetentionDays,
        logRetentionDays: s.logRetentionDays,
        dateFormat: s.dateFormat,
        timezone: s.timezone,
        graph: { tenantId: savedHint(s.graph.encTenantId), clientId: savedHint(s.graph.encClientId), hasSecret: !!s.graph.encClientSecret, senderAddress: s.graph.senderAddress, senderName: s.graph.senderName },
        sql: { server: s.sql.server, port: s.sql.port, database: s.sql.database, authType: s.sql.authType, domain: s.sql.domain, user: savedHint(s.sql.encUser), hasPassword: !!s.sql.encPassword, encrypt: s.sql.encrypt, trustServerCertificate: s.sql.trustServerCertificate },
      }}
    />
  );
}
