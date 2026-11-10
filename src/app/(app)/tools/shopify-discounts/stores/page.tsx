import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { publicStore } from "@/lib/shopify/stores";
import { DEFAULT_API_VERSION } from "@/lib/shopify/client";
import { StoresClient } from "./stores-client";

export const metadata: Metadata = { title: "Shopify stores" };

export default async function StoresPage() {
  const user = await requireTool("shopify-discounts");
  // Store management is limited to admins (Super Admin or any role with an admin permission).
  if (!user.isAdmin) {
    await logAudit({ action: "access.denied", category: "AUTH", actorId: user.id, actorEmail: user.email, success: false, metadata: { page: "shopify-discounts/stores", requires: "admin" } });
    redirect("/tools/shopify-discounts");
  }
  const stores = await prisma.shopifyStore.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { discounts: true } } } });
  return <StoresClient defaultApiVersion={DEFAULT_API_VERSION} stores={stores.map((s) => ({ ...publicStore(s), discountCount: s._count.discounts }))} />;
}
