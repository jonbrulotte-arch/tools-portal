import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { toolSettingsPermission } from "@/lib/permissions";
import { NewDiscountForm } from "./new-discount-form";

export const metadata: Metadata = { title: "New discount" };

export default async function NewDiscountPage() {
  const user = await requireTool("shopify-discounts");
  const [stores, presets] = await Promise.all([
    prisma.shopifyStore.findMany({ where: { enabled: true }, orderBy: { name: "asc" } }),
    getSetting("shopifyDiscountForm"),
  ]);
  return (
    <NewDiscountForm
      canManageStores={user.isAdmin}
      isAdmin={user.isAdmin || user.can(toolSettingsPermission("shopify-discounts"))}
      presets={presets}
      stores={stores.map((s) => ({ id: s.id, name: s.name, shopDomain: s.shopDomain, currency: s.currencyCode }))}
    />
  );
}
