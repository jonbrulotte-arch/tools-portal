import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { NewDiscountForm } from "./new-discount-form";

export const metadata: Metadata = { title: "New discount" };

export default async function NewDiscountPage() {
  const user = await requireTool("shopify-discounts");
  const stores = await prisma.shopifyStore.findMany({ where: { enabled: true }, orderBy: { name: "asc" } });
  return (
    <NewDiscountForm
      canManageStores={user.isAdmin}
      stores={stores.map((s) => ({ id: s.id, name: s.name, shopDomain: s.shopDomain, currency: s.currencyCode }))}
    />
  );
}
