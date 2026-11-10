import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl, verifyShopifyHmac } from "@/lib/shopify/oauth";
import { explainTokenError } from "@/lib/shopify/client-error";

function signed(params: Record<string, string>, secret: string) {
  const msg = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  const q = new URLSearchParams(params);
  q.set("hmac", createHmac("sha256", secret).update(msg).digest("hex"));
  return q;
}

const base = { code: "abc123", host: "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvdGVzdA", shop: "test.myshopify.com", state: "nonce", timestamp: "1700000000" };

describe("Shopify OAuth", () => {
  it("accepts a correctly signed callback", () => {
    expect(verifyShopifyHmac(signed(base, "shh"), "shh")).toBe(true);
  });
  it("rejects tampered params, wrong secret and missing hmac", () => {
    const q = signed(base, "shh");
    q.set("shop", "evil.myshopify.com");
    expect(verifyShopifyHmac(q, "shh")).toBe(false);
    expect(verifyShopifyHmac(signed(base, "shh"), "other")).toBe(false);
    expect(verifyShopifyHmac(new URLSearchParams(base), "shh")).toBe(false);
  });
  it("builds the authorize URL with scopes, redirect and state", () => {
    process.env.APP_URL = "http://10.0.10.106:8016";
    const url = new URL(buildAuthorizeUrl({ shopDomain: "test.myshopify.com", clientId: "cid" }, "nonce123"));
    expect(url.origin + url.pathname).toBe("https://test.myshopify.com/admin/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("scope")).toBe("write_discounts,read_discounts,read_products");
    expect(url.searchParams.get("redirect_uri")).toBe("http://10.0.10.106:8016/api/tools/shopify-discounts/oauth/callback");
    expect(url.searchParams.get("state")).toBe("nonce123");
    expect(url.searchParams.has("grant_options[]")).toBe(false);
  });
  it("explains shop_not_permitted", () => {
    expect(explainTokenError("Shopify token request failed (400): Client credentials cannot be performed on this shop.")).toContain("Connect with Shopify");
  });
});
