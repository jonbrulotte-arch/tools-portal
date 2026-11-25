import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadMangoExport, mangoExportUrl, rollingRange } from "@/lib/shipping/mango-import";
import { mangoImportSchema } from "@/lib/shipping/mango-schema";
import { isDue, nextRun } from "@/lib/timezone";
import { SETTING_DEFAULTS } from "@/lib/settings";
import { costReportXlsx } from "./helpers/cost-report";

const s = SETTING_DEFAULTS.shippingRates;


describe("Mango import", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds Mango's export URL with the full field list", () => {
    expect(mangoExportUrl(s, "2026-08-15", "2026-11-13")).toBe("http://mango.jsproducts.com/qc-dims/public/excel/Reader/php/exshipcost?to=2026-11-13&from=2026-08-15&limitedFields=false");
  });

  it("uses a rolling range ending today in the schedule's time zone", () => {
    // 06:00 UTC on Nov 13 is still Nov 12 in Las Vegas
    expect(rollingRange(90, new Date("2026-11-13T06:00:00Z"), "America/Los_Angeles")).toEqual({ from: "2026-08-14", to: "2026-11-12" });
    expect(rollingRange(90, new Date("2026-11-13T06:00:00Z"), "America/New_York")).toEqual({ from: "2026-08-15", to: "2026-11-13" });
  });

  it("runs at midnight Monday, an hour before the quote run", () => {
    expect(isDue({ ...s.mangoImport, enabled: true }, new Date("2026-11-16T08:00:00Z"))).toBe(true); // Mon 12 AM PST
    expect(isDue({ ...s.schedule, enabled: true }, new Date("2026-11-16T09:00:00Z"))).toBe(true); // quote run 1 AM
    expect(nextRun({ ...s.mangoImport, enabled: true }, new Date("2026-11-13T19:00:00Z"))?.toISOString()).toBe("2026-11-16T08:00:00.000Z");
  });

  it("downloads an Excel export", async () => {
    const xlsx = await costReportXlsx();
    const f = vi.fn(async () => new Response(new Uint8Array(xlsx), { headers: { "content-type": "application/vnd.ms-excel" } }));
    vi.stubGlobal("fetch", f);
    const { buffer, url } = await downloadMangoExport(s, "2026-11-01", "2026-11-02");
    expect(buffer.equals(xlsx)).toBe(true);
    expect(url).toContain("from=2026-11-01");
  });

  it("explains a login page, an error or an empty answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!DOCTYPE html><html><body>Sign in</body></html>", { headers: { "content-type": "text/html" } })));
    await expect(downloadMangoExport(s, "2026-11-01", "2026-11-02")).rejects.toThrow("Mango sent a web page instead of the Excel export (HTTP 200)");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    await expect(downloadMangoExport(s, "2026-11-01", "2026-11-02")).rejects.toThrow("an empty response instead of the Excel export (HTTP 500)");
    vi.stubGlobal("fetch", vi.fn(async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }); }));
    await expect(downloadMangoExport(s, "2026-11-01", "2026-11-02")).rejects.toThrow("Couldn't connect to mango.jsproducts.com (ENOTFOUND)");
  });

  it("refuses an export over 80 MB", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("PK", { headers: { "content-length": String(90 * 1024 * 1024) } })));
    await expect(downloadMangoExport(s, "2026-01-01", "2026-11-02")).rejects.toThrow("over the 80 MB limit");
  });

  it("checks the date range for the Import button", () => {
    expect(mangoImportSchema.safeParse({ from: "2026-08-15", to: "2026-11-13" }).success).toBe(true);
    expect(mangoImportSchema.safeParse({ from: "2026-11-13", to: "2026-08-15" }).success).toBe(false);
    expect(mangoImportSchema.safeParse({ from: "2024-01-01", to: "2026-11-13" }).success).toBe(false);
    expect(mangoImportSchema.safeParse({ from: "2026-11-01", to: "2099-01-01" }).success).toBe(false);
  });
});
