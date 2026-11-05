import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { jsonError, errorMessage } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { testConnection } from "@/lib/shopify/client";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ tool: "shopify-discounts", permission: "tool.shopify-discounts.manage-stores" });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const store = await prisma.shopifyStore.findUnique({ where: { id } });
  if (!store) return jsonError("Store not found", 404);
  try {
    const result = await testConnection(store);
    await prisma.shopifyStore.update({ where: { id }, data: { currencyCode: result.currencyCode } });
    await logAudit({ action: "shopify.store_tested", category: "SHOPIFY", actorId: actor.id, actorEmail: actor.email, targetType: "ShopifyStore", targetId: id, success: result.hasWriteDiscounts, metadata: { shopDomain: store.shopDomain, ...result } });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await logAudit({ action: "shopify.store_tested", category: "SHOPIFY", actorId: actor.id, actorEmail: actor.email, targetType: "ShopifyStore", targetId: id, success: false, metadata: { shopDomain: store.shopDomain, error: errorMessage(err) } });
    return jsonError(errorMessage(err), 502);
  }
}
