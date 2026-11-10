import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/rbac";
import { decrypt } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { appUrl } from "@/lib/email-templates";
import { errorMessage } from "@/lib/api";
import { OAUTH_COOKIE, OAUTH_MAX_AGE_SECONDS, exchangeCode, verifyShopifyHmac } from "@/lib/shopify/oauth";

const STORES_PAGE = "/tools/shopify-discounts/stores";

function finish(params: Record<string, string>) {
  const res = NextResponse.redirect(appUrl(`${STORES_PAGE}?${new URLSearchParams(params)}`));
  res.cookies.set(OAUTH_COOKIE, "", { path: "/api/tools/shopify-discounts", maxAge: 0 });
  return res;
}

function sameString(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Shopify redirects here after the admin approves the app.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(appUrl(`/login?next=${encodeURIComponent(STORES_PAGE)}`));
  if (!user.canUseTool("shopify-discounts") || !user.can("tool.shopify-discounts.manage-stores")) {
    await logAudit({ action: "access.denied", category: "AUTH", actorId: user.id, actorEmail: user.email, success: false, metadata: { permission: "tool.shopify-discounts.manage-stores", route: "oauth/callback" } });
    return finish({ oauthError: "You don't have permission to connect stores." });
  }

  const query = req.nextUrl.searchParams;
  const fail = async (reason: string, storeId?: string, extra: Record<string, unknown> = {}) => {
    await logAudit({ action: "shopify.oauth_failed", category: "SHOPIFY", actorId: user.id, actorEmail: user.email, targetType: "ShopifyStore", targetId: storeId ?? null, success: false, metadata: { reason, shop: query.get("shop"), ...extra } });
    return finish({ oauthError: reason });
  };

  const cookie = req.cookies.get(OAUTH_COOKIE)?.value ?? "";
  const [nonce, storeId] = cookie.split(".");
  const state = query.get("state") ?? "";
  if (!nonce || !storeId || !state || !sameString(state, nonce)) {
    return fail("The connection request expired or didn't come from this browser. Click Connect again.");
  }

  const store = await prisma.shopifyStore.findUnique({ where: { id: storeId } });
  if (!store || store.authType !== "OAUTH" || !store.encClientSecret) return fail("This store is no longer set up for Connect with Shopify.", storeId);
  if ((query.get("shop") ?? "").toLowerCase() !== store.shopDomain) {
    return fail(`Shopify returned a different shop (${query.get("shop")}) than this store (${store.shopDomain}).`, store.id);
  }
  if (!verifyShopifyHmac(query, decrypt(store.encClientSecret))) {
    return fail("Shopify's signature didn't match. Check that this store's Client secret belongs to the same app as its Client ID.", store.id);
  }
  const ts = Number(query.get("timestamp"));
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > OAUTH_MAX_AGE_SECONDS) {
    return fail("The approval took too long or the server clock is off. Click Connect again.", store.id);
  }
  const code = query.get("code");
  if (!code) return fail("Shopify didn't return an authorization code.", store.id);

  try {
    const { scopes } = await exchangeCode(store, code);
    await logAudit({ action: "shopify.oauth_connected", category: "SHOPIFY", actorId: user.id, actorEmail: user.email, targetType: "ShopifyStore", targetId: store.id, metadata: { shopDomain: store.shopDomain, scopes } });
    return finish({ connected: store.id });
  } catch (err) {
    return fail(errorMessage(err), store.id);
  }
}
