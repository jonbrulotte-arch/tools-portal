import { createHmac, timingSafeEqual } from "node:crypto";
import type { ShopifyStore } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { appUrl } from "@/lib/email-templates";
import { ShopifyError, explainTokenError } from "@/lib/shopify/client-error";

// "Connect with Shopify": OAuth authorization code grant with expiring offline
// tokens. Works for any store the app is installed on, regardless of which
// Dev Dashboard organization owns the store.

export const OAUTH_SCOPES = ["write_discounts", "read_discounts", "read_products"];
export const OAUTH_COOKIE = "shopify_oauth";
export const OAUTH_MAX_AGE_SECONDS = 600;

export function oauthRedirectUri(): string {
  return appUrl("/api/tools/shopify-discounts/oauth/callback");
}

export function buildAuthorizeUrl(store: Pick<ShopifyStore, "shopDomain" | "clientId">, state: string): string {
  if (!store.clientId) throw new ShopifyError("Client ID is missing for this store");
  const params = new URLSearchParams({
    client_id: store.clientId,
    scope: OAUTH_SCOPES.join(","),
    redirect_uri: oauthRedirectUri(),
    state,
  });
  return `https://${store.shopDomain}/admin/oauth/authorize?${params.toString()}`;
}

/** Verify the hmac Shopify adds to the OAuth callback query string. */
export function verifyShopifyHmac(query: URLSearchParams, secret: string): boolean {
  const hmac = query.get("hmac");
  if (!hmac || !/^[0-9a-f]{64}$/i.test(hmac)) return false;
  const message = [...query.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const expected = createHmac("sha256", secret).update(message).digest();
  const given = Buffer.from(hmac, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(store: ShopifyStore, params: Record<string, string>): Promise<Required<Pick<TokenResponse, "access_token">> & TokenResponse> {
  if (!store.clientId || !store.encClientSecret) throw new ShopifyError("Client ID / secret missing for this store");
  const res = await fetch(`https://${store.shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: store.clientId, client_secret: decrypt(store.encClientSecret), ...params }),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !body.access_token) {
    throw new ShopifyError(explainTokenError(`Shopify token request failed (${res.status}): ${body.error_description ?? body.error ?? res.statusText}`));
  }
  return body as Required<Pick<TokenResponse, "access_token">> & TokenResponse;
}

async function saveTokens(store: ShopifyStore, t: TokenResponse & { access_token: string }, connecting: boolean) {
  const now = Date.now();
  const data = {
    encCachedToken: encrypt(t.access_token),
    // Without expires_in Shopify issued a non-expiring token; re-check in a year.
    cachedTokenExpiresAt: new Date(now + (t.expires_in ?? 365 * 86400) * 1000),
    encRefreshToken: t.refresh_token ? encrypt(t.refresh_token) : null,
    refreshTokenExpiresAt: t.refresh_token ? new Date(now + (t.refresh_token_expires_in ?? 90 * 86400) * 1000) : null,
    ...(t.scope ? { oauthScopes: t.scope } : {}),
    ...(connecting ? { oauthConnectedAt: new Date(now) } : {}),
  };
  await prisma.shopifyStore.update({ where: { id: store.id }, data });
  Object.assign(store, data);
}

/** Exchange the authorization code from the callback for an expiring offline token pair. */
export async function exchangeCode(store: ShopifyStore, code: string) {
  const t = await tokenRequest(store, { code, expiring: "1" });
  await saveTokens(store, t, true);
  return { scopes: t.scope ?? "" };
}

const refreshing = new Map<string, Promise<string>>();

/** Refresh the access token with the stored refresh token (one refresh per store at a time). */
export function refreshOAuthToken(store: ShopifyStore): Promise<string> {
  const pending = refreshing.get(store.id);
  if (pending) return pending;
  const run = (async () => {
    // Re-read: another request may already have rotated the refresh token.
    const fresh = await prisma.shopifyStore.findUniqueOrThrow({ where: { id: store.id } });
    if (fresh.encCachedToken && fresh.cachedTokenExpiresAt && fresh.cachedTokenExpiresAt.getTime() > Date.now() + 5 * 60_000 && fresh.encCachedToken !== store.encCachedToken) {
      Object.assign(store, fresh);
      return decrypt(fresh.encCachedToken);
    }
    if (!fresh.encRefreshToken || !fresh.refreshTokenExpiresAt || fresh.refreshTokenExpiresAt.getTime() <= Date.now()) {
      throw new ShopifyError("This store's Shopify connection has expired. Click Connect on the Stores page to reconnect.");
    }
    const t = await tokenRequest(fresh, { grant_type: "refresh_token", refresh_token: decrypt(fresh.encRefreshToken) });
    await saveTokens(store, t, false);
    return t.access_token;
  })().finally(() => refreshing.delete(store.id));
  refreshing.set(store.id, run);
  return run;
}

export function isOAuthConnected(store: Pick<ShopifyStore, "authType" | "encCachedToken" | "encRefreshToken" | "refreshTokenExpiresAt" | "cachedTokenExpiresAt">) {
  if (store.authType !== "OAUTH" || !store.encCachedToken) return false;
  if (store.encRefreshToken && store.refreshTokenExpiresAt) return store.refreshTokenExpiresAt.getTime() > Date.now();
  return !!store.cachedTokenExpiresAt && store.cachedTokenExpiresAt.getTime() > Date.now();
}
