import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!enabled)("Shopify OAuth tokens (database)", async () => {
  const { prisma } = await import("@/lib/prisma");
  const { encrypt, decrypt } = await import("@/lib/crypto");
  const { exchangeCode } = await import("@/lib/shopify/oauth");
  const { getAccessToken, adminGraphql } = await import("@/lib/shopify/client");

  let storeId = "";
  const load = () => prisma.shopifyStore.findUniqueOrThrow({ where: { id: storeId } });

  beforeAll(async () => {
    await prisma.shopifyStore.deleteMany({ where: { shopDomain: "oauth-test.myshopify.com" } });
    const s = await prisma.shopifyStore.create({ data: { name: "OAuth", shopDomain: "oauth-test.myshopify.com", authType: "OAUTH", clientId: "cid", encClientSecret: encrypt("csecret") } });
    storeId = s.id;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("refuses to call Shopify before the store is connected", async () => {
    await expect(getAccessToken(await load())).rejects.toThrow("isn't connected yet");
  });

  it("exchanges the code for an expiring token pair and stores it encrypted", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(String(init.body));
      expect(body.get("code")).toBe("the-code");
      expect(body.get("expiring")).toBe("1");
      expect(body.get("client_secret")).toBe("csecret");
      return new Response(JSON.stringify({ access_token: "shpat_A", expires_in: 3600, refresh_token: "shprt_A", refresh_token_expires_in: 7776000, scope: "write_discounts,read_products" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    await exchangeCode(await load(), "the-code");
    const s = await load();
    expect(s.encCachedToken).not.toContain("shpat_A");
    expect(decrypt(s.encCachedToken!)).toBe("shpat_A");
    expect(decrypt(s.encRefreshToken!)).toBe("shprt_A");
    expect(s.oauthScopes).toBe("write_discounts,read_products");
    expect(s.oauthConnectedAt).toBeTruthy();
    expect(await getAccessToken(s)).toBe("shpat_A");
  });

  it("refreshes an expired access token and stores the rotated refresh token", async () => {
    await prisma.shopifyStore.update({ where: { id: storeId }, data: { cachedTokenExpiresAt: new Date(Date.now() - 1000) } });
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      const body = new URLSearchParams(String(init.body));
      expect(url).toBe("https://oauth-test.myshopify.com/admin/oauth/access_token");
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("shprt_A");
      return new Response(JSON.stringify({ access_token: "shpat_B", expires_in: 3600, refresh_token: "shprt_B", refresh_token_expires_in: 7776000 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const store = await load();
    const [a, b] = await Promise.all([getAccessToken(store), getAccessToken(store)]);
    expect(a).toBe("shpat_B");
    expect(b).toBe("shpat_B");
    expect(fetchMock).toHaveBeenCalledTimes(1); // one refresh even with parallel callers
    expect(decrypt((await load()).encRefreshToken!)).toBe("shprt_B");
  });

  it("refreshes once after a 401 from the Admin API", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith("/access_token")) return new Response(JSON.stringify({ access_token: "shpat_C", expires_in: 3600, refresh_token: "shprt_C", refresh_token_expires_in: 7776000 }));
      if (calls.filter((c) => c.endsWith("graphql.json")).length === 1) return new Response("{}", { status: 401 });
      return new Response(JSON.stringify({ data: { shop: { name: "OK" } } }));
    }));
    const data = await adminGraphql<{ shop: { name: string } }>(await load(), "{ shop { name } }");
    expect(data.shop.name).toBe("OK");
    expect(calls.map((c) => c.split("/").pop())).toEqual(["graphql.json", "access_token", "graphql.json"]);
  });

  it("asks for a reconnect when the refresh token has expired", async () => {
    await prisma.shopifyStore.update({ where: { id: storeId }, data: { cachedTokenExpiresAt: new Date(Date.now() - 1000), refreshTokenExpiresAt: new Date(Date.now() - 1000) } });
    vi.stubGlobal("fetch", vi.fn());
    await expect(getAccessToken(await load())).rejects.toThrow("Click Connect on the Stores page to reconnect");
  });
});
