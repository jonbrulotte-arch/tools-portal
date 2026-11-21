import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { AUTO_EMAILS_EDIT, AUTO_EMAILS_TOOL } from "@/lib/auto-emails/access";
import { EmailsClient } from "./emails-client";

export const metadata: Metadata = { title: "Automated emails" };

export default async function AutoEmailsPage() {
  const user = await requireTool(AUTO_EMAILS_TOOL);
  const [emails, s, sentCounts] = await Promise.all([
    prisma.autoEmail.findMany({ orderBy: { name: "asc" } }),
    getSetting("autoEmails"),
    prisma.autoEmailSentKey.groupBy({ by: ["emailId"], _count: true }),
  ]);
  const counts = Object.fromEntries(sentCounts.map((c) => [c.emailId, c._count]));
  return (
    <EmailsClient
      canManage={user.can(AUTO_EMAILS_EDIT)}
      schedule={{ enabled: s.enabled, intervalMinutes: s.intervalMinutes, graphReady: !!(s.graph.encTenantId && s.graph.encClientId && s.graph.encClientSecret && s.graph.senderAddress), sqlReady: !!(s.sql.server && s.sql.database && s.sql.encUser && s.sql.encPassword) }}
      emails={emails.map((e) => ({
        id: e.id,
        name: e.name,
        enabled: e.enabled,
        to: e.to,
        cc: e.cc,
        subject: e.subject,
        lastCheckedAt: e.lastCheckedAt?.toISOString() ?? null,
        lastSentAt: e.lastSentAt?.toISOString() ?? null,
        lastStatus: e.lastStatus,
        lastError: e.lastError,
        recordsSent: counts[e.id] ?? 0,
      }))}
    />
  );
}
