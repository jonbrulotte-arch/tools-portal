import type { ShopifyStore } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { ShopifyError, explainTokenError } from "@/lib/shopify/client-error";
import { refreshOAuthToken } from "@/lib/shopify/oauth";

export { ShopifyError };
export const DEFAULT_API_VERSION = "2026-10";

/** Normalise "my-shop", "my-shop.myshopify.com" or "https://my-shop.myshopify.com/admin" to "my-shop.myshopify.com". */
export function normalizeShopDomain(input: string): string {
  let d = input.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  if (!d.includes(".")) d = `${d}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(d)) throw new ShopifyError("Shop domain must look like your-store.myshopify.com");
  return d;
}

/**
 * Access token for a store:
 * - ACCESS_TOKEN: the static Admin API token
 * - CLIENT_CREDENTIALS: client-credentials token (cached encrypted, refreshed before expiry)
 * - OAUTH: expiring offline token from "Connect with Shopify", renewed with the refresh token
 */
export async function getAccessToken(store: ShopifyStore, opts: { forceRefresh?: boolean } = {}): Promise<string> {
  if (store.authType === "ACCESS_TOKEN") {
    if (!store.encAccessToken) throw new ShopifyError("No Admin API access token saved for this store");
    return decrypt(store.encAccessToken);
  }
  if (store.authType === "OAUTH") {
    if (!store.encCachedToken) throw new ShopifyError("This store isn't connected yet. Click Connect on the Stores page to approve the app in Shopify.");
    if (!opts.forceRefresh && store.cachedTokenExpiresAt && store.cachedTokenExpiresAt.getTime() > Date.now() + 5 * 60_000) {
      return decrypt(store.encCachedToken);
    }
    return refreshOAuthToken(store);
  }
  if (!opts.forceRefresh && store.encCachedToken && store.cachedTokenExpiresAt && store.cachedTokenExpiresAt.getTime() > Date.now() + 5 * 60_000) {
    return decrypt(store.encCachedToken);
  }
  if (!store.clientId || !store.encClientSecret) throw new ShopifyError("Client ID / secret missing for this store");
  const res = await fetch(`https://${store.shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: store.clientId, client_secret: decrypt(store.encClientSecret) }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new ShopifyError(explainTokenError(`Shopify token request failed (${res.status}): ${body.error_description ?? body.error ?? res.statusText}`));
  }
  const expiresAt = new Date(Date.now() + (body.expires_in ?? 86399) * 1000);
  const encCachedToken = encrypt(body.access_token);
  await prisma.shopifyStore.update({ where: { id: store.id }, data: { encCachedToken, cachedTokenExpiresAt: expiresAt } });
  // Keep the in-memory record current so later calls in this request reuse the token.
  store.encCachedToken = encCachedToken;
  store.cachedTokenExpiresAt = expiresAt;
  return body.access_token;
}

type GraphqlResponse<T> = { data?: T; errors?: { message: string; extensions?: { code?: string } }[]; extensions?: unknown };

/** Call the Admin GraphQL API with retry on throttling and one token refresh on 401. */
export async function adminGraphql<T = Record<string, unknown>>(store: ShopifyStore, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  let token = await getAccessToken(store);
  let refreshed = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`https://${store.shopDomain}/admin/api/${store.apiVersion}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 401 && store.authType !== "ACCESS_TOKEN" && !refreshed) {
      token = await getAccessToken(store, { forceRefresh: true });
      refreshed = true;
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as GraphqlResponse<T>;
    if (!res.ok) {
      throw new ShopifyError(`Shopify API error (${res.status}): ${body.errors?.map((e) => e.message).join("; ") || res.statusText}`, body);
    }
    if (body.errors?.some((e) => e.extensions?.code === "THROTTLED")) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (body.errors?.length) throw new ShopifyError(`Shopify GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`, body);
    return body.data as T;
  }
  throw new ShopifyError("Shopify API is throttling or unavailable; please try again shortly");
}

/** Connection test: shop name/currency and whether the token carries discount scopes. */
export async function testConnection(store: ShopifyStore) {
  const data = await adminGraphql<{
    shop: { name: string; currencyCode: string; myshopifyDomain: string };
    currentAppInstallation: { accessScopes: { handle: string }[] };
  }>(store, `{ shop { name currencyCode myshopifyDomain } currentAppInstallation { accessScopes { handle } } }`);
  const scopes = data.currentAppInstallation.accessScopes.map((s) => s.handle);
  return {
    shopName: data.shop.name,
    currencyCode: data.shop.currencyCode,
    scopes,
    hasWriteDiscounts: scopes.includes("write_discounts"),
    hasReadProducts: scopes.includes("read_products") || scopes.includes("write_products"),
  };
}
