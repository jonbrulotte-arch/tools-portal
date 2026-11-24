import { afterEach, describe, expect, it, vi } from "vitest";
import { isChanged, pushNote, pushValue, pushValues } from "@/lib/shipping/blended-push";
import type { BlendSummary } from "@/lib/shipping/blended-view";

const origins = [{ code: "LV", name: "Las Vegas, NV" }, { code: "GV", name: "Groveport, OH" }];
const blend = (o: Partial<BlendSummary> = {}): BlendSummary => ({
  cost: 17.123, best: 10, worst: 25, coverage: 1, incomplete: false, basis: "shipments", label: "From 13 UPS shipments last month: all Groveport, OH", understates: false,
  shares: { GV: 1 }, carrier: { method: "actual-mix", source: "warehouse", uspsShare: { GV: 0.4 }, upsUplift: { GV: 0.1 } }, cheapest: { carrier: "UPS", usps: 18.4, ups: 16.9 }, stock: {}, shipments: { GV: 13 }, otherShipments: 0, inventoryAsOf: null, inventoryError: null, ...o,
});

describe("Salsify push value", () => {
  it("OK note from the basis, cost to the cent, cheapest carrier, date last", () => {
    const v = pushValue(blend(), origins)!;
    expect(v).toEqual({ cost: "17.12", note: "OK: from 13 UPS shipments last month: all Groveport, OH", carrier: "UPS" });
    expect(pushValues(v, "2026-11-23")).toEqual(["17.12", "OK: from 13 UPS shipments last month: all Groveport, OH", "UPS", "2026-11-23"]);
    expect(pushValue(blend({ cheapest: null }), origins)?.carrier).toBe("Unknown");
  });

  it("describes every issue, never empty", () => {
    expect(pushNote(blend({ incomplete: true, coverage: 0.62 }), origins)).toBe("Incomplete: only 62% of orders priced (some zones over a carrier limit or failed)");
    expect(pushNote(blend({ basis: "stock-one", understates: true, shares: { LV: 1 } }), origins)).toBe("Stocked in Las Vegas, NV only; may understate");
    expect(pushNote(blend({ basis: "company", label: "No Mango data yet: company-wide split" }), origins)).toBe("No Mango data: company-wide split");
    expect(pushNote(blend({ basis: "company", label: "No stock or shipment data in Mango: company-wide split" }), origins)).toBe("No stock or shipments in Mango: company-wide split");
    expect(pushNote(blend({ basis: "few-shipments", shipments: { LV: 2 } }), origins)).toBe("Few shipments (2)");
    expect(pushNote(blend({ incomplete: true, coverage: 0.5, basis: "stock-one", understates: true, shares: { GV: 1 } }), origins)).toBe(
      "Incomplete: only 50% of orders priced (some zones over a carrier limit or failed); Stocked in Groveport, OH only; may understate",
    );
    expect(pushNote(blend({ basis: "stock-both", label: "Stocked equally in both: company-wide split" }), origins)).toBe("OK: stocked equally in both: company-wide split");
    expect(pushNote(blend({ basis: "stock-both", understates: true, shares: { GV: 1 } }), origins)).toBe("Stocked in both; ships from Groveport, OH (most stock); may understate");
  });

  it("has nothing to push without a cost", () => {
    expect(pushValue(blend({ cost: null }), origins)).toBeNull();
    expect(pushValue(null, origins)).toBeNull();
  });

  it("only counts a change of cost, note or carrier", () => {
    const v = { cost: "17.12", note: "OK: x", carrier: "USPS" };
    expect(isChanged(null, v)).toBe(true);
    expect(isChanged({ cost: "17.12", note: "OK: x", carrier: "USPS" }, v)).toBe(false);
    expect(isChanged({ cost: "17.13", note: "OK: x", carrier: "USPS" }, v)).toBe(true);
    expect(isChanged({ cost: "17.12", note: "Few shipments (2)", carrier: "USPS" }, v)).toBe(true);
    // pushed before the carrier was added: written again once
    expect(isChanged({ cost: "17.12", note: "OK: x", carrier: null }, v)).toBe(true);
    expect(isChanged({ cost: "17.12", note: "OK: x", carrier: "UPS" }, v)).toBe(true);
  });
});

describe("Salsify writes", () => {
  afterEach(() => vi.unstubAllGlobals());
  const salsify = () => import("@/lib/salsify");

  it("PUTs the property's values, retrying throttling", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return ++n === 1 ? new Response("{}", { status: 429 }) : new Response("{}", { status: 200 });
    }));
    const { updateSalsifyProduct } = await salsify();
    await updateSalsifyProduct("key", "s-org", "00028-S", "Blended Shipping Cost", ["17.12", "OK: x", "2026-11-23"], async () => {});
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toMatch(/\/orgs\/s-org\/products\/00028-S$/);
    expect(calls[1].init.method).toBe("PUT");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ "Blended Shipping Cost": ["17.12", "OK: x", "2026-11-23"] });
  });

  it("explains a missing product and a key without edit rights", async () => {
    const { updateSalsifyProduct } = await salsify();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    await expect(updateSalsifyProduct("k", "o", "X", "P", ["1"], async () => {})).rejects.toThrow("Product X isn't in Salsify");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    await expect(updateSalsifyProduct("k", "o", "X", "P", ["1"], async () => {})).rejects.toThrow(/needs edit rights/);
  });

  it("reads a property definition", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ "salsify:id": "Blended Shipping Cost", "salsify:data_type": "string", "salsify:is_multi_valued": true }), { status: 200 })));
    const { getSalsifyProperty } = await salsify();
    expect(await getSalsifyProperty("k", "o", "Blended Shipping Cost")).toEqual({ id: "Blended Shipping Cost", name: null, dataType: "string", multiValued: true });
  });
});
