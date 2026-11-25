import type { Prisma } from "@prisma/client";

export type AuditFilters = { from?: string; to?: string; category?: string; result?: string; q?: string; actor?: string };

export function auditWhere(f: AuditFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  const createdAt: Prisma.DateTimeFilter = {};
  if (f.from && !isNaN(Date.parse(f.from))) createdAt.gte = new Date(f.from);
  if (f.to && !isNaN(Date.parse(f.to))) createdAt.lte = new Date(`${f.to}T23:59:59.999`);
  if (createdAt.gte || createdAt.lte) where.createdAt = createdAt;
  if (f.category && f.category !== "all") where.category = f.category;
  if (f.result === "success") where.success = true;
  if (f.result === "failure") where.success = false;
  if (f.actor) where.actorEmail = { contains: f.actor, mode: "insensitive" };
  if (f.q) {
    where.OR = [
      { action: { contains: f.q, mode: "insensitive" } },
      { actorEmail: { contains: f.q, mode: "insensitive" } },
      { targetId: { contains: f.q, mode: "insensitive" } },
      { ip: { contains: f.q } },
    ];
  }
  return where;
}

export const AUDIT_CATEGORIES = ["AUTH", "USER", "ROLE", "TOOL", "SETTINGS", "BACKUP", "SHOPIFY", "NAV", "AUDIT", "SYSTEM"];
