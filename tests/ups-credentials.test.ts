import { afterEach, describe, expect, it, vi } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";
import { SETTING_DEFAULTS, type ShippingRatesSettings } from "@/lib/settings";
import { getQuote, upsCredentialStatus } from "@/lib/shipping/carriers";
import { mergeUpsCredentials, redactUpsCredentials, shippingSettingsSchema } from "@/lib/shipping/settings-schema";

const creds = (id: string, secret: string) => ({ encClientId: encrypt(id), encClientSecret: encrypt(secret) });

describe("per-account UPS credentials: saving", () => {
  const saved = { "796305": creds("lv-client-id-0001", "lv-secret"), "9X0F56": creds("gv-client-id-0002", "gv-secret") };

  it("keeps blanks, replaces new values, clears on request and drops removed accounts", () => {
    const out = mergeUpsCredentials(saved, { "796305": { clientSecret: "new-lv-secret" }, "9x0f56": { clear: true }, W293F5: { clientId: "w2-client-id-0003" } }, ["796305", "9X0F56", "W293F5"]);
    expect(decrypt(out["796305"].encClientId!)).toBe("lv-client-id-0001"); // blank: kept
    expect(decrypt(out["796305"].encClientSecret!)).toBe("new-lv-secret");
    expect(out["9X0F56"]).toBeUndefined(); // cleared (and the edit's lower-case key still matched)
    expect(decrypt(out.W293F5.encClientId!)).toBe("w2-client-id-0003");
    expect(out.W293F5.encClientSecret).toBeNull();
    expect(Object.keys(mergeUpsCredentials(saved, {}, ["796305"]))).toEqual(["796305"]); // 9X0F56 removed from the list
  });

  it("never puts values in the audit log", () => {
    const r = redactUpsCredentials(saved);
    expect(r).toEqual({ "796305": { clientId: "set", secret: "set" }, "9X0F56": { clientId: "set", secret: "set" } });
    expect(JSON.stringify(r)).not.toContain("secret\":\"lv");
  });

  it("no longer accepts a shared UPS client ID", () => {
    const parsed = shippingSettingsSchema.shape.ups.safeParse({ environment: "production", apiVersion: "v2403", clientId: "x" });
    expect(parsed.success && "clientId" in parsed.data).toBe(false);
  });
});

describe("per-account UPS credentials: quoting", () => {
  afterEach(() => vi.unstubAllGlobals());

  const s: ShippingRatesSettings = {
    ...SETTING_DEFAULTS.shippingRates,
    upsCredentials: { "796305": creds("lv-client-id-0001", "lv-secret"), "9X0F56": creds("gv-client-id-0002", "gv-secret") },
  };
  const q = (origin: string, originZip: string) => ({ carrier: "UPS" as const, service: "GROUND_COM" as const, origin, originZip, destZip: "10001", zone: 8, weight: 2 });
  const rated = { RateResponse: { RatedShipment: { TotalCharges: { MonetaryValue: "20.00" }, NegotiatedRateCharges: { TotalCharge: { MonetaryValue: "12.00" } } } } };

  function stubUps(opts: { failRateOnceFor?: string } = {}) {
    const calls: { kind: "token" | "rate"; auth: string; account: string }[] = [];
    let failed = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const h = init.headers as Record<string, string>;
        if (url.includes("/oauth/token")) {
          const [id] = Buffer.from(h.Authorization.slice(6), "base64").toString().split(":");
          calls.push({ kind: "token", auth: id, account: h["x-merchant-id"] });
          return new Response(JSON.stringify({ access_token: `token-for-${id}`, expires_in: 3600 }), { status: 200 });
        }
        const account = JSON.parse(String(init.body)).RateRequest.Shipment.Shipper.ShipperNumber;
        calls.push({ kind: "rate", auth: h.Authorization, account });
        if (opts.failRateOnceFor === account && !failed) {
          failed = true;
          return new Response("{}", { status: 401 });
        }
        return new Response(JSON.stringify(rated), { status: 200 });
      }),
    );
    return calls;
  }

  it("gets a token with each account's own credentials and quotes with it", async () => {
    const calls = stubUps();
    const lv = { ...s, ups: { ...s.ups, environment: "test" as const } }; // a fresh token cache key for this test
    await getQuote(lv, "live", q("LV", "89113"));
    await getQuote(lv, "live", q("GV", "43125"));
    await getQuote(lv, "live", q("LV", "89113")); // cached token, no new token request
    const tokens = calls.filter((c) => c.kind === "token");
    expect(tokens).toEqual([
      { kind: "token", auth: "lv-client-id-0001", account: "796305" },
      { kind: "token", auth: "gv-client-id-0002", account: "9X0F56" },
    ]);
    expect(calls.filter((c) => c.kind === "rate").map((c) => [c.account, c.auth])).toEqual([
      ["796305", "Bearer token-for-lv-client-id-0001"],
      ["9X0F56", "Bearer token-for-gv-client-id-0002"],
      ["796305", "Bearer token-for-lv-client-id-0001"],
    ]);
  });

  it("drops only that account's token after a 401", async () => {
    const calls = stubUps({ failRateOnceFor: "9X0F56" });
    await getQuote(s, "live", q("LV", "89113"));
    await expect(getQuote(s, "live", q("GV", "43125"))).rejects.toThrow(/401/);
    await getQuote(s, "live", q("GV", "43125"));
    await getQuote(s, "live", q("LV", "89113"));
    expect(calls.filter((c) => c.kind === "token").map((c) => c.account)).toEqual(["796305", "9X0F56", "9X0F56"]); // LV kept its token
  });

  it("refuses an account without its own credentials, with no UPS call", async () => {
    const calls = stubUps();
    const missing = { ...s, upsCredentials: { "796305": s.upsCredentials["796305"] } };
    expect(upsCredentialStatus(missing, "9X0F56")).toBe("missing");
    expect(upsCredentialStatus(missing, "796305")).toBe("ready");
    await expect(getQuote(missing, "live", q("GV", "43125"))).rejects.toThrow("UPS account 9X0F56 has no API credentials");
    expect(calls).toEqual([]);
  });

  it("can quote with a specific account (Settings test)", async () => {
    const calls = stubUps();
    await getQuote({ ...s, upsCredentials: { ...s.upsCredentials, W293F5: creds("w2-client-id-0003", "w2") } }, "live", { ...q("LV", "89113"), upsAccount: "W293F5" });
    expect(calls.map((c) => c.account)).toEqual(["W293F5", "W293F5"]);
  });
});
