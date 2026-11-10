import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/rbac";
import { generateToken } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { appUrl } from "@/lib/email-templates";
import { errorMessage } from "@/lib/api";
import { OAUTH_COOKIE, OAUTH_MAX_AGE_SECONDS, buildAuthorizeUrl, oauthRedirectUri } from "@/lib/shopify/oauth";

const STORES_PAGE = "/tools/shopify-discounts/stores";

function back(params: Record<string, string>) {
  return NextResponse.redirect(appUrl(`${STORES_PAGE}?${new URLSearchParams(params)}`));
}

// "Connect with Shopify": send the admin's browser to Shopify to approve the app.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(appUrl(`/login?next=${encodeURIComponent(STORES_PAGE)}`));
  if (!user.canUseTool("shopify-discounts") || !user.can("tool.shopify-discounts.manage-stores")) {
    await logAudit({ action: "access.denied", category: "AUTH", actorId: user.id, actorEmail: user.email, success: false, metadata: { permission: "tool.shopify-discounts.manage-stores", route: "oauth/start" } });
    return back({ oauthError: "You don't have permission to connect stores." });
  }
  const { id } = await params;
  const store = await prisma.shopifyStore.findUnique({ where: { id } });
  if (!store) return back({ oauthError: "Store not found." });
  if (store.authType !== "OAUTH") return back({ oauthError: `${store.name} isn't set to "Connect with Shopify". Edit the store and choose that method first.` });

  const nonce = generateToken(24);
  let url: string;
  try {
    url = buildAuthorizeUrl(store, nonce);
  } catch (err) {
    return back({ oauthError: errorMessage(err) });
  }
  await logAudit({ action: "shopify.oauth_started", category: "SHOPIFY", actorId: user.id, actorEmail: user.email, targetType: "ShopifyStore", targetId: store.id, metadata: { shopDomain: store.shopDomain, redirectUri: oauthRedirectUri() } });

  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, `${nonce}.${store.id}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl().startsWith("https://"),
    path: "/api/tools/shopify-discounts",
    maxAge: OAUTH_MAX_AGE_SECONDS,
  });
  return res;
}
