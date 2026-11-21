import type { Metadata } from "next";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { auditWhere, type AuditFilters } from "@/lib/admin/audit-query";
import { AccessLogClient } from "./access-log-client";

export const metadata: Metadata = { title: "Access Log" };

const PAGE_SIZE = 50;

export default async function AccessLogPage({ searchParams }: { searchParams: Promise<AuditFilters & { page?: string }> }) {
  const actor = await requirePermission("admin.audit");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = auditWhere(sp);
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.auditLog.count({ where }),
  ]);
  if (page === 1) await logAudit({ action: "audit.viewed", category: "AUDIT", actorId: actor.id, actorEmail: actor.email, metadata: { filters: sp } });
  return (
    <AccessLogClient
      filters={sp}
      page={page}
      pageSize={PAGE_SIZE}
      total={total}
      rows={rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        actorEmail: r.actorEmail,
        action: r.action,
        category: r.category,
        targetType: r.targetType,
        targetId: r.targetId,
        success: r.success,
        ip: r.ip,
        userAgent: r.userAgent,
        metadata: r.metadata,
      }))}
    />
  );
}
