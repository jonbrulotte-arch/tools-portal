import { z } from "zod";
import type { ShopifyStore } from "@prisma/client";
import { DEFAULT_API_VERSION } from "@/lib/shopify/client";
import { isOAuthConnected } from "@/lib/shopify/oauth";

/** Store fields safe to send to the browser (never secrets). */
export function publicStore(s: ShopifyStore) {
  return {
    id: s.id,
    name: s.name,
    shopDomain: s.shopDomain,
    authType: s.authType,
    clientId: s.clientId,
    hasAccessToken: !!s.encAccessToken,
    hasClientSecret: !!s.encClientSecret,
    oauthConnected: isOAuthConnected(s),
    oauthConnectedAt: s.oauthConnectedAt?.toISOString() ?? null,
    oauthExpiresAt: s.refreshTokenExpiresAt?.toISOString() ?? null,
    oauthScopes: s.oauthScopes,
    apiVersion: s.apiVersion,
    currencyCode: s.currencyCode,
    enabled: s.enabled,
  };
}
export type PublicStore = ReturnType<typeof publicStore>;

export const storeSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  shopDomain: z.string().min(1, "Shop domain is required").max(255),
  authType: z.enum(["ACCESS_TOKEN", "CLIENT_CREDENTIALS", "OAUTH"]),
  accessToken: z.string().max(500).optional(),
  clientId: z.string().max(200).optional(),
  clientSecret: z.string().max(500).optional(),
  apiVersion: z.string().regex(/^\d{4}-\d{2}$/, "API version looks like 2026-10").default(DEFAULT_API_VERSION),
  enabled: z.boolean().default(true),
});

/** Fields that drop every stored token, used when a store's credentials change. */
export const CLEARED_TOKENS = {
  encCachedToken: null,
  cachedTokenExpiresAt: null,
  encRefreshToken: null,
  refreshTokenExpiresAt: null,
  oauthScopes: null,
  oauthConnectedAt: null,
} as const;
