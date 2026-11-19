import { beforeAll, describe, expect, it, vi } from "vitest";

const enabled = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!enabled)("carrier API usage (database)", async () => {
  const { prisma } = await import("@/lib/prisma");
  const { SETTING_DEFAULTS } = await import("@/lib/settings");
  const { recordApiCall, flushApiUsage, clearPendingApiCalls } = await import("@/lib/shipping/api-usage");
  const { backfillApiUsageEstimates, apiUsageReport } = await import("@/lib/shipping/api-report");
  const s = { ...SETTING_DEFAULTS.shippingRates, endicia: { ...SETTING_DEFAULTS.shippingRates.endicia, accountId: "2500123" } };

  beforeAll(async () => {
    clearPendingApiCalls();
    await prisma.carrierApiUsage.deleteMany();
    await prisma.shippingQuoteRun.deleteMany();
    await prisma.productRateRun.deleteMany();
  });

  it("writes buffered calls as per-day counters that add up across flushes", async () => {
    const at = new Date("2026-11-18T20:00:00Z"); // 12:00 Pacific on the 18th
    for (let i = 0; i < 3; i++) recordApiCall({ carrier: "UPS", account: "796305", source: "quote_run", kind: "rate", outcome: "ok" }, at);
    recordApiCall({ carrier: "UPS", account: "796305", source: "quote_run", kind: "token", outcome: "ok" }, at);
    await flushApiUsage();
    recordApiCall({ carrier: "UPS", account: "796305", source: "quote_run", kind: "rate", outcome: "ok" }, at);
    recordApiCall({ carrier: "UPS", account: "796305", source: "quote_run", kind: "rate", outcome: "ok" }, new Date("2026-11-19T07:30:00Z")); // 23:30 Pacific: still the 18th
    await flushApiUsage();
    const rows = await prisma.carrierApiUsage.findMany({ where: { kind: "rate" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ day: "2026-11-18", count: 5 });
  });

  it("never fails the caller when the write fails", async () => {
    recordApiCall({ carrier: "UPS", account: "796305", source: "quote_run", kind: "rate", outcome: "ok" });
    const spy = vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(flushApiUsage()).resolves.toBeUndefined();
    spy.mockRestore();
    err.mockRestore();
  });

  it("estimates earlier days from stored live runs only, before the first recorded day, once", async () => {
    const quote = (carrier: string, origin: string, createdAt: Date, ok = true) => ({ carrier, service: carrier === "UPS" ? "GROUND_COM" : "GROUND_ADVANTAGE", origin, zone: 5, destZip: "10001", weight: 2, amount: ok ? 10 : null, error: ok ? null : "UPS: busy", createdAt });
    const day10 = new Date("2026-11-10T18:00:00Z");
    await prisma.shippingQuoteRun.create({
      data: { mode: "live", config: {}, quotes: { create: [quote("UPS", "LV", day10), quote("UPS", "LV", day10), quote("UPS", "GV", day10, false), quote("USPS", "LV", day10), quote("UPS", "LV", new Date("2026-11-18T18:00:00Z"))] } },
    });
    await prisma.shippingQuoteRun.create({ data: { mode: "simulated", config: {}, quotes: { create: [quote("UPS", "LV", day10)] } } });
    await prisma.productRateRun.create({
      data: {
        mode: "live",
        listId: "s-x",
        items: { create: [{ position: 0, partNumber: "P1", status: "OK", createdAt: new Date("2026-11-12T18:00:00Z"), quotes: { create: [{ origin: "GV", zone: 2, carrier: "UPS", service: "GROUND_RES", destZip: "43125", amount: 9 }, { origin: "GV", zone: 2, carrier: "USPS", service: "GROUND_ADVANTAGE", destZip: "43125", error: "Over the USPS 70 lb limit" }] } }] },
      },
    });
    expect(await backfillApiUsageEstimates(s)).toBe(5); // 3 UPS + 1 USPS on the 10th, 1 product quote on the 12th; the 18th is already recorded
    const est = await prisma.carrierApiUsage.findMany({ where: { source: "estimate" }, orderBy: [{ day: "asc" }, { account: "asc" }, { outcome: "asc" }] });
    expect(est.map((e) => [e.day, e.carrier, e.account, e.outcome, e.count])).toEqual([
      ["2026-11-10", "USPS", "2500123", "ok", 1],
      ["2026-11-10", "UPS", "796305", "ok", 2],
      ["2026-11-10", "UPS", "9X0F56", "error", 1],
      ["2026-11-12", "UPS", "9X0F56", "ok", 1],
    ]);
    expect(await backfillApiUsageEstimates(s)).toBe(0); // only once

    const r = await apiUsageReport(s, { from: "2026-11-09", to: "2026-11-18" });
    expect(r.totals).toMatchObject({ requests: 10, estimated: 5, activeDays: 3, avgDaily: 1, tokens: 1 });
    expect(r.daily.find((d) => d.day === "2026-11-10")?.estimated).toBe(true);
  });
});
