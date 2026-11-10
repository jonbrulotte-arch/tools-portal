import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { publicStore } from "@/lib/shopify/stores";
import { DEFAULT_API_VERSION } from "@/lib/shopify/client";
import { oauthRedirectUri } from "@/lib/shopify/oauth";
import { StoresClient } from "./stores-client";

export const metadata: Metadata = { title: "Shopify stores" };

export default async function StoresPage({ searchParams }: { searchParams: Promise<{ connected?: string; oauthError?: string }> }) {
  const user = await requireTool("shopify-discounts");
  if (!user.can("tool.shopify-discounts.manage-stores")) redirect("/tools/shopify-discounts");
  const sp = await searchParams;
  const stores = await prisma.shopifyStore.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { discounts: true } } } });
  const connectedName = sp.connected ? stores.find((s) => s.id === sp.connected)?.name : undefined;
  return (
    <StoresClient
      defaultApiVersion={DEFAULT_API_VERSION}
      redirectUri={oauthRedirectUri()}
      initialNotice={
        sp.oauthError
          ? { type: "error", text: `Couldn't connect to Shopify: ${sp.oauthError.slice(0, 600)}` }
          : connectedName
            ? { type: "success", text: `${connectedName} is connected to Shopify. Use "Test connection" to check its permissions.` }
            : null
      }
      stores={stores.map((s) => ({ ...publicStore(s), discountCount: s._count.discounts }))}
    />
  );
}
