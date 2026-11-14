import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSalsifyList, iterateSalsifyList, listFilter, normalizeListId, testSalsifyList } from "@/lib/salsify";
import { isDue } from "@/lib/timezone";
import { SETTING_DEFAULTS } from "@/lib/settings";

const fields = SETTING_DEFAULTS.shippingRates.salsify.fields;
const product = (id: string, extra: Record<string, unknown> = {}) => ({ "salsify:id": id, "Item Name": { "en-US": `Item ${id}` }, ...extra });
const shipping = { "Shipping Weight (Pounds)": "1.5", "Shipping Length (Inches)": "10", "Shipping Width (Inches)": "8", "Shipping Height (Inches)": "4" };
const upc = { "UPC Weight (Pounds)": "0.25", "UPC Length (Inches)": "6.75", "UPC Width (Inches)": "3.00", "UPC Height (Inches)": "2.00" };

describe("Salsify list", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("pages through a list with Salsify's list filter and cursor", async () => {
    const pages = [
      { data: [product("A", shipping), product("B", upc)], meta: { cursor: "c2", total_entries: 3 } },
      { data: [product("C"), product("A", shipping)], meta: { cursor: null, total_entries: 3 } },
    ];
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (urls.push(url), new Response(JSON.stringify(pages.shift())))));
    const list = await fetchSalsifyList("key", "s-org", "12345", fields);
    expect(list.map((p) => [p.partNumber, p.weight, p.source])).toEqual([
      ["A", 1.5, "primary"],
      ["B", 0.25, "fallback"], // UPC fallback
      ["C", null, null], // no data
    ]);
    const first = new URL(urls[0]);
    expect(first.pathname).toBe("/api/v1/orgs/s-org/products");
    expect(first.searchParams.get("filter")).toBe("=list:'12345'");
    expect(new URL(urls[1]).searchParams.get("cursor")).toBe("c2");
  });

  it("quotes the list ID and accepts a pasted Salsify address", () => {
    expect(listFilter("s-b813b681-ac5e-453a-a060-e7adee716984")).toBe("=list:'s-b813b681-ac5e-453a-a060-e7adee716984'");
    expect(normalizeListId("https://app.salsify.com/app/orgs/s-7231dcaa-b6b1-4f5d-85c3-7743ba479fee/product_lists/s-b813b681-ac5e-453a-a060-e7adee716984")).toBe("s-b813b681-ac5e-453a-a060-e7adee716984");
    expect(normalizeListId("https://app.salsify.com/app/orgs/s-org/lists/12345?view=grid")).toBe("12345");
    expect(normalizeListId("  s-b813b681-ac5e-453a-a060-e7adee716984 ")).toBe("s-b813b681-ac5e-453a-a060-e7adee716984");
  });

  it("retries a slow or busy page, then carries on", async () => {
    const replies: (() => Response)[] = [
      () => { throw Object.assign(new Error("aborted"), { name: "TimeoutError" }); },
      () => new Response("busy", { status: 503 }),
      () => new Response(JSON.stringify({ data: [product("A", shipping)], meta: { cursor: null, total_entries: 1 } })),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => replies.shift()!()));
    const waits: number[] = [];
    const list = await fetchSalsifyList("key", "s-org", "s-list", fields, { wait: async (ms) => waits.push(ms) });
    expect(list.map((p) => p.partNumber)).toEqual(["A"]);
    expect(waits).toEqual([5000, 15000]);
  });

  it("gives up on a page after 5 tries and says so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw Object.assign(new Error("aborted"), { name: "TimeoutError" }); }));
    await expect(fetchSalsifyList("key", "s-org", "s-list", fields, { wait: async () => {} })).rejects.toThrow("Salsify didn't answer within 120s (gave up after 5 tries)");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(5);
  });

  it("streams a list page by page", async () => {
    const pages = [{ data: [product("A", shipping), product("B", shipping)], meta: { cursor: "c2", total_entries: 3 } }, { data: [product("C", shipping)], meta: { cursor: null, total_entries: 3 } }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(pages.shift()))));
    const seen: [number, number | null][] = [];
    for await (const page of iterateSalsifyList("key", "s-org", "s-list", fields)) seen.push([page.products.length, page.total]);
    expect(seen).toEqual([[2, 3], [1, 3]]);
  });

  it("explains a list Salsify can't read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: ["Filter is invalid"] }), { status: 422 })));
    await expect(fetchSalsifyList("key", "s-org", "999", fields)).rejects.toThrow("Salsify couldn't read list 999 (Filter is invalid)");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1); // a bad list isn't retried
    await expect(fetchSalsifyList("key", "s-org", "", fields)).rejects.toThrow("No Salsify list is set");
  });

  it("previews a list for the Settings test", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [product("A", shipping)], meta: { total_entries: "1480" } }))));
    expect(await testSalsifyList("key", "s-org", "12345", fields)).toMatchObject({ total: 1480, sample: [{ partNumber: "A", weight: 1.5 }] });
  });

  it("runs Sunday 1 AM Pacific by default", () => {
    const p = { ...SETTING_DEFAULTS.shippingRates.productRates, enabled: true };
    expect(isDue(p, new Date("2026-11-15T09:00:00Z"))).toBe(true); // Sun 1 AM PST
    expect(isDue(p, new Date("2026-11-16T09:00:00Z"))).toBe(false); // Monday
  });
});
