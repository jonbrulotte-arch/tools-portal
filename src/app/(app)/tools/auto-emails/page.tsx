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
  // every enabled email failing the same way usually means one shared cause (SQL Server, Graph): say so once
  const on = emails.filter((e) => e.enabled);
  const sameFailure = on.length > 0 && on.every((e) => e.lastStatus === "failed" && e.lastError === on[0].lastError) ? on[0].lastError : null;
  let outage: { error: string; since: string | null; lastSuccess: string | null; emails: number } | null = null;
  if (sameFailure) {
    const lastOk = await prisma.autoEmailLog.findFirst({ where: { status: "SENT", trigger: { not: "TEST" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    const firstFail = await prisma.autoEmailLog.findFirst({ where: { status: "FAILED", ...(lastOk ? { createdAt: { gt: lastOk.createdAt } } : {}) }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
    outage = { error: sameFailure, since: firstFail?.createdAt.toISOString() ?? null, lastSuccess: lastOk?.createdAt.toISOString() ?? null, emails: on.length };
  }
  return (
    <EmailsClient
      canManage={user.can(AUTO_EMAILS_EDIT)}
      outage={outage}
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
