import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { parseBody, jsonError } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { CLEARED_TOKENS, publicStore, storeSchema } from "@/lib/shopify/stores";

const patchSchema = storeSchema.omit({ shopDomain: true });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ tool: "shopify-discounts", permission: "tool.shopify-discounts.manage-stores" });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = await parseBody(req, patchSchema);
  if (body instanceof NextResponse) return body;
  const store = await prisma.shopifyStore.findUnique({ where: { id } });
  if (!store) return jsonError("Store not found", 404);

  const switching = body.authType !== store.authType;
  const newClientId = body.clientId || store.clientId;
  const credentialsChanged = switching || !!body.accessToken || !!body.clientSecret || newClientId !== store.clientId;
  const data = {
    name: body.name,
    apiVersion: body.apiVersion,
    enabled: body.enabled,
    authType: body.authType,
    // Any change of method or credentials invalidates every stored token.
    ...(credentialsChanged ? CLEARED_TOKENS : {}),
    ...(body.authType === "ACCESS_TOKEN"
      ? {
          encAccessToken: body.accessToken ? encrypt(body.accessToken) : store.encAccessToken,
          clientId: null,
          encClientSecret: null,
        }
      : {
          encAccessToken: null,
          clientId: newClientId,
          encClientSecret: body.clientSecret ? encrypt(body.clientSecret) : store.encClientSecret,
        }),
  };
  if (data.authType === "ACCESS_TOKEN" && !data.encAccessToken) return jsonError("Admin API access token is required");
  if (data.authType !== "ACCESS_TOKEN" && (!data.clientId || !data.encClientSecret)) return jsonError("Client ID and client secret are required");

  const updated = await prisma.shopifyStore.update({ where: { id }, data });
  await logAudit({
    action: "shopify.store_updated",
    category: "SHOPIFY",
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: "ShopifyStore",
    targetId: id,
    metadata: { name: body.name, shopDomain: store.shopDomain, authType: body.authType, enabled: body.enabled, apiVersion: body.apiVersion, credentialsChanged },
  });
  return NextResponse.json({ ok: true, store: publicStore(updated) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ tool: "shopify-discounts", permission: "tool.shopify-discounts.manage-stores" });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const store = await prisma.shopifyStore.findUnique({ where: { id }, include: { _count: { select: { discounts: true } } } });
  if (!store) return jsonError("Store not found", 404);
  if (store._count.discounts > 0) return jsonError(`This store has ${store._count.discounts} discount record(s). Disable it instead so the history is kept.`);
  await prisma.shopifyStore.delete({ where: { id } });
  await logAudit({ action: "shopify.store_deleted", category: "SHOPIFY", actorId: actor.id, actorEmail: actor.email, targetType: "ShopifyStore", targetId: id, metadata: { name: store.name, shopDomain: store.shopDomain } });
  return NextResponse.json({ ok: true });
}
