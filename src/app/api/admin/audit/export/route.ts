import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { auditWhere } from "@/lib/admin/audit-query";
import { logAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";

export async function GET(req: Request) {
  const actor = await guard({ permission: "admin.audit" });
  if (actor instanceof NextResponse) return actor;
  const filters = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await prisma.auditLog.findMany({ where: auditWhere(filters), orderBy: { createdAt: "desc" }, take: 100_000 });
  await logAudit({ action: "audit.exported", category: "AUDIT", actorId: actor.id, actorEmail: actor.email, metadata: { filters, rows: rows.length } });
  const csv = toCsv(
    ["time", "user", "action", "category", "target_type", "target_id", "success", "ip", "user_agent", "details"],
    rows.map((r) => [r.createdAt.toISOString(), r.actorEmail, r.action, r.category, r.targetType, r.targetId, r.success, r.ip, r.userAgent, r.metadata ? JSON.stringify(r.metadata) : ""]),
  );
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="access-log-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
