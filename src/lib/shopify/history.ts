import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/rbac";

export type HistoryFilters = { store?: string; status?: string; q?: string; scope?: string; from?: string; to?: string };

export function historyWhere(user: CurrentUser, f: HistoryFilters): Prisma.ShopifyDiscountWhereInput {
  const canViewAll = user.can("tool.shopify-discounts.view-all");
  const where: Prisma.ShopifyDiscountWhereInput = {};
  if (!canViewAll || f.scope === "mine") where.createdById = user.id;
  if (f.store && f.store !== "all") where.storeId = f.store;
  if (f.status === "CREATED" || f.status === "FAILED") where.status = f.status;
  const createdAt: Prisma.DateTimeFilter = {};
  if (f.from && !isNaN(Date.parse(f.from))) createdAt.gte = new Date(f.from);
  if (f.to && !isNaN(Date.parse(f.to))) createdAt.lte = new Date(`${f.to}T23:59:59.999`);
  if (createdAt.gte || createdAt.lte) where.createdAt = createdAt;
  if (f.q) {
    where.OR = [
      { title: { contains: f.q, mode: "insensitive" } },
      { codes: { has: f.q.toUpperCase() } },
      { createdByEmail: { contains: f.q, mode: "insensitive" } },
    ];
  }
  return where;
}
