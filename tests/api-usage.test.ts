import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encrypt } from "@/lib/crypto";
import { SETTING_DEFAULTS, type ShippingRatesSettings } from "@/lib/settings";
import { getQuote, getQuoteWithRetry } from "@/lib/shipping/carriers";
import { clearPendingApiCalls, outcomeFor, pendingApiCalls, usageDay } from "@/lib/shipping/api-usage";
import { accountsFrom, addDays, buildApiReport, resolvePeriod, apiReportCsv, type UsageRow } from "@/lib/shipping/api-report";

const s: ShippingRatesSettings = {
  ...SETTING_DEFAULTS.shippingRates,
  mode: "live",
  upsCredentials: { "796305": { encClientId: encrypt("usage-lv-client"), encClientSecret: encrypt("x") } },
  endicia: { requesterId: "req", accountId: "2500123", encPassPhrase: encrypt("pp"), endpoint: "https://endicia.example/LabelService" },
};
const ups = { carrier: "UPS" as const, service: "GROUND_COM" as const, origin: "LV", originZip: "89113", destZip: "10001", zone: 8, weight: 2 };
const rated = JSON.stringify({ RateResponse: { RatedShipment: { TotalCharges: { MonetaryValue: "20.00" } } } });
const calls = () => Object.fromEntries(pendingApiCalls().map((c) => [c.key.slice(1).join("|"), c.count]));

describe("recording carrier API calls", () => {
  beforeEach(() => clearPendingApiCalls());
  afterEach(() => vi.unstubAllGlobals());

  it("counts the token and every rate attempt, retries included, by account and source", async () => {
    let rateCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/oauth/token")) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
        return ++rateCalls === 1 ? new Response("{}", { status: 429 }) : new Response(rated, { status: 200 });
      }),
    );
    await getQuoteWithRetry({ ...s, ups: { ...s.ups, apiVersion: "v2409" } }, "live", { ...ups, source: "product_quote" }, {}, async () => {});
    expect(calls()).toEqual({
      "UPS|796305|product_quote|token|ok": 1,
      "UPS|796305|product_quote|rate|throttled": 1,
      "UPS|796305|product_quote|rate|ok": 1,
    });
    expect(pendingApiCalls()[0].key[0]).toBe(usageDay());
  });

  it("counts Endicia requests against the Endicia account, and failures as errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>oops</html>", { status: 500 })));
    await expect(getQuote(s, "live", { ...ups, carrier: "USPS", service: "GROUND_ADVANTAGE" })).rejects.toThrow();
    expect(calls()).toEqual({ "USPS|2500123|quote_run|rate|error": 1 });
  });

  it("counts a network failure, and nothing at all in simulated mode", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } }); }));
    await expect(getQuote(s, "live", { ...ups, carrier: "USPS", service: "GROUND_ADVANTAGE", source: "settings_test" })).rejects.toThrow(/couldn't connect/);
    expect(calls()).toEqual({ "USPS|2500123|settings_test|rate|error": 1 });
    clearPendingApiCalls();
    await getQuote(s, "simulated", ups);
    expect(pendingApiCalls()).toEqual([]);
  });

  it("maps HTTP statuses to outcomes", () => {
    expect([200, 204, 400, 401, 429, 500, 503].map(outcomeFor)).toEqual(["ok", "ok", "error", "error", "throttled", "error", "throttled"]);
  });
});

describe("API report maths", () => {
  const period = resolvePeriod({ from: "2026-11-01", to: "2026-11-10" });
  const row = (day: string, account: string, count: number, extra: Partial<UsageRow> = {}): UsageRow => ({ day, carrier: "UPS", account, source: "quote_run", kind: "rate", outcome: "ok", count, ...extra });
  const rows: UsageRow[] = [
    row("2026-11-02", "796305", 2268),
    row("2026-11-02", "796305", 12, { outcome: "throttled" }),
    row("2026-11-02", "796305", 1, { kind: "token" }),
    row("2026-11-09", "796305", 2280),
    row("2026-11-09", "9X0F53", 2268),
    row("2026-11-05", "9X0F53", 42, { source: "product_quote" }),
    row("2026-10-30", "9X0F53", 999), // outside the period
    row("2026-11-03", "OLD123", 10, { source: "estimate", outcome: "error" }), // no longer in Settings
    { day: "2026-11-09", carrier: "USPS", account: "2500123", source: "quote_run", kind: "rate", outcome: "ok", count: 640 },
  ];
  const r = buildApiReport(rows, period, accountsFrom(s));
  const acct = (a: string) => r.accounts.find((x) => x.account === a)!;

  it("divides by calendar days for the average daily volume, and by active days alongside", () => {
    expect(period.days).toHaveLength(10);
    expect(r.totals.requests).toBe(2268 + 12 + 2280 + 2268 + 42 + 10 + 640);
    expect(r.totals.avgDaily).toBe(Math.round((r.totals.requests / 10) * 100) / 100);
    expect(r.totals.activeDays).toBe(4); // 2nd, 3rd, 5th, 9th
    expect(acct("796305")).toMatchObject({ requests: 4560, avgDaily: 456, activeDays: 2, avgActiveDay: 2280, throttled: 12, tokens: 1, peak: { day: "2026-11-09", count: 2280 } });
    expect(acct("9X0F53")).toMatchObject({ requests: 2310, avgDaily: 231, activeDays: 2, bySource: expect.objectContaining({ quote_run: 2268, product_quote: 42 }) });
    expect(r.totals.peak).toEqual({ day: "2026-11-09", count: 2280 + 2268 + 640 });
  });

  it("lists every quoting account (even silent), the Endicia account and old accounts with traffic, colours fixed by Settings order", () => {
    // default Settings: LV quotes with 796305, GV with 9X0F56 (silent here, so listed at 0); 9X0F53 has traffic
    expect(r.accounts.map((a) => a.account)).toEqual(["796305", "9X0F53", "OLD123", "9X0F56", "2500123"]);
    expect(acct("9X0F56")).toMatchObject({ requests: 0, quoting: true, warehouse: "Groveport, OH" });
    expect(acct("OLD123")).toMatchObject({ warehouse: null, quoting: false, estimated: 10, errors: 10 });
    expect(acct("796305").colorSlot).toBe(0);
    // an account's slot comes from its place in Settings, never from its ranking in a period
    const slots = new Map(r.accounts.map((a) => [a.account, a.colorSlot]));
    const other = buildApiReport([row("2026-11-02", "9X0F53", 99999)], period, accountsFrom(s));
    expect(other.accounts.find((a) => a.account === "9X0F53")!.colorSlot).toBe(slots.get("9X0F53"));
    const empty = buildApiReport([], period, accountsFrom(s));
    expect(empty.accounts.map((a) => a.account)).toEqual(["796305", "9X0F56", "2500123"]); // quoting accounts shown at zero
    expect(empty.totals).toMatchObject({ requests: 0, avgDaily: 0, avgActiveDay: 0, peak: null });
  });

  it("zero-fills every day and flags estimated days", () => {
    expect(r.daily).toHaveLength(10);
    expect(r.daily[0]).toMatchObject({ day: "2026-11-01", "UPS:796305": 0, estimated: false });
    expect(r.daily.find((d) => d.day === "2026-11-03")).toMatchObject({ "UPS:OLD123": 10, estimated: true });
  });

  it("resolves 'last N days' and exports CSV with a totals line", () => {
    expect(resolvePeriod({ days: 7 }, "2026-11-19")).toMatchObject({ from: "2026-11-13", to: "2026-11-19" });
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // across DST
    const csv = apiReportCsv(r).split("\n");
    expect(csv[1]).toMatch(/^Carrier,Account,Warehouse,Quote with,Rate requests,Avg daily/);
    expect(csv[2]).toMatch(/^UPS,796305,"Las Vegas, NV",yes,4560,456,2280,2,2026-11-09,2280,0,12,1,4560/);
    expect(csv.at(-2)).toMatch(/^All,,,,/);
  });
});
