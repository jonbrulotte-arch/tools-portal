import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { logWhere, type LogQuery } from "@/lib/auto-emails/log-filter";
import { AUTO_EMAILS_TOOL } from "@/lib/auto-emails/access";
import { LogClient } from "./log-client";

export const metadata: Metadata = { title: "Automated email log" };

const PAGE_SIZE = 50;

export default async function AutoEmailLogPage({ searchParams }: { searchParams: Promise<LogQuery> }) {
  await requireTool(AUTO_EMAILS_TOOL);
  const sp = await searchParams;
  const where = logWhere(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const [total, logs, emails] = await Promise.all([
    prisma.autoEmailLog.count({ where }),
    prisma.autoEmailLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: { id: true, emailName: true, trigger: true, status: true, to: true, cc: true, subject: true, rowCount: true, error: true, durationMs: true, actorEmail: true, createdAt: true } }),
    prisma.autoEmail.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <LogClient
      emails={emails}
      filters={{ email: sp.email ?? "", status: sp.status ?? "", trigger: sp.trigger ?? "" }}
      page={page}
      pages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
      total={total}
      logs={logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))}
    />
  );
}
