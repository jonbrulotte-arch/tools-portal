import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { historyWhere, type HistoryFilters } from "@/lib/shopify/history";
import { HistoryClient } from "./history-client";

export const metadata: Metadata = { title: "Shopify discounts" };
const PAGE_SIZE = 25;

export default async function ShopifyDiscountsPage({ searchParams }: { searchParams: Promise<HistoryFilters & { page?: string }> }) {
  const user = await requireTool("shopify-discounts");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = historyWhere(user, sp);
  const [rows, total, stores, stats] = await Promise.all([
    prisma.shopifyDiscount.findMany({ where, include: { store: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.shopifyDiscount.count({ where }),
    prisma.shopifyStore.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.shopifyDiscount.groupBy({ by: ["status"], where: historyWhere(user, {}), _count: true }),
  ]);
  return (
    <HistoryClient
      canViewAll={user.can("tool.shopify-discounts.view-all")}
      filters={sp}
      page={page}
      pageSize={PAGE_SIZE}
      total={total}
      stores={stores}
      stats={{ created: stats.find((s) => s.status === "CREATED")?._count ?? 0, failed: stats.find((s) => s.status === "FAILED")?._count ?? 0 }}
      rows={rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        storeName: r.store.name,
        shopDomain: r.store.shopDomain,
        currency: r.store.currencyCode,
        title: r.title,
        valueType: r.valueType,
        value: r.value?.toString() ?? null,
        codes: r.codes,
        status: r.status,
        errorMessage: r.errorMessage,
        createdByEmail: r.createdByEmail,
        shopifyDiscountId: r.shopifyDiscountId,
        startsAt: r.startsAt?.toISOString() ?? null,
        endsAt: r.endsAt?.toISOString() ?? null,
        config: r.config,
        requestPayload: r.requestPayload,
        responsePayload: r.responsePayload,
      }))}
    />
  );
}
