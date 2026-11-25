import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { parseBody, jsonError, errorMessage } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { normalizeShopDomain } from "@/lib/shopify/client";
import { publicStore, storeSchema } from "@/lib/shopify/stores";


export async function POST(req: Request) {
  const actor = await guard({ tool: "shopify-discounts", admin: true }) // store management: admins only;
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(req, storeSchema);
  if (body instanceof NextResponse) return body;
  let shopDomain: string;
  try {
    shopDomain = normalizeShopDomain(body.shopDomain);
  } catch (err) {
    return jsonError(errorMessage(err));
  }
  if (await prisma.shopifyStore.findUnique({ where: { shopDomain } })) return jsonError("That store is already connected.", 409);
  if (body.authType === "ACCESS_TOKEN" && !body.accessToken) return jsonError("Admin API access token is required");
  if (body.authType === "CLIENT_CREDENTIALS" && (!body.clientId || !body.clientSecret)) return jsonError("Client ID and client secret are required");

  const store = await prisma.shopifyStore.create({
    data: {
      name: body.name,
      shopDomain,
      authType: body.authType,
      apiVersion: body.apiVersion,
      enabled: body.enabled,
      encAccessToken: body.authType === "ACCESS_TOKEN" ? encrypt(body.accessToken!) : null,
      clientId: body.authType === "CLIENT_CREDENTIALS" ? body.clientId : null,
      encClientSecret: body.authType === "CLIENT_CREDENTIALS" ? encrypt(body.clientSecret!) : null,
    },
  });
  await logAudit({ action: "shopify.store_added", category: "SHOPIFY", actorId: actor.id, actorEmail: actor.email, targetType: "ShopifyStore", targetId: store.id, metadata: { name: store.name, shopDomain, authType: store.authType } });
  return NextResponse.json({ ok: true, store: publicStore(store) });
}
