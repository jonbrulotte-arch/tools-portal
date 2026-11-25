import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!enabled)("Products runs (database)", async () => {
  const { prisma } = await import("@/lib/prisma");
  const { setSetting } = await import("@/lib/settings");
  const { setUserSecret } = await import("@/lib/user-credentials");
  const { startProductRun, pruneProductRuns } = await import("@/lib/shipping/product-rates");
  const { failInterruptedJobs } = await import("@/lib/shipping/runner");
  const { loadProductPage, loadProductItem } = await import("@/lib/shipping/product-rates-view");

  const ship = (w: string, l: string, wd: string, h: string) => ({ "Shipping Weight (Pounds)": w, "Shipping Length (Inches)": l, "Shipping Width (Inches)": wd, "Shipping Height (Inches)": h });
  const list = { data: [{ "salsify:id": "P1", "Item Name": "Scraper", ...ship("0.3", "9", "7", "2") }, { "salsify:id": "P2", "Item Name": "Big box", ...ship("6", "18", "14", "12") }, { "salsify:id": "P3", "Item Name": "No data" }], meta: { cursor: null, total_entries: 3 } };
  let user = { id: "", email: "products@example.com" };

  beforeAll(async () => {
    await prisma.productRateRun.deleteMany();
    await prisma.userCredential.deleteMany();
    await prisma.user.deleteMany({ where: { email: user.email } });
    const role = (await prisma.role.findFirst()) ?? (await prisma.role.create({ data: { name: "Tester role" } }));
    const u = await prisma.user.create({ data: { email: user.email, name: "Products tester", roleId: role.id, status: "ACTIVE" } });
    user = { id: u.id, email: u.email };
    await setUserSecret(u.id, "salsify", "test-key-123456");
    await setSetting("shippingRates", {
      mode: "simulated",
      salsify: { orgId: "s-org", fields: (await import("@/lib/settings")).SETTING_DEFAULTS.shippingRates.salsify.fields },
      productRates: { enabled: false, listId: "12345", keyUserId: u.id, frequency: "weekly", weekday: 0, hour: 1, timezone: "America/Los_Angeles", keepRuns: 4 },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(list))));
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.productRateRun.deleteMany();
  });

  it("quotes every product on the list and stores the results", async () => {
    const { run, finished } = await startProductRun(user);
    await finished;
    const r = await prisma.productRateRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(r).toMatchObject({ status: "READY", total: 3, done: 3, failed: 1, mode: "simulated", listId: "12345" });
    const page = await loadProductPage(run.id, {}, { LV: 8, GV: 4 });
    expect(page.items.map((i) => [i.partNumber, i.status])).toEqual([["P1", "OK"], ["P2", "OK"], ["P3", "NO_DATA"]]);
    expect(page.items[1]).toMatchObject({ upsBillable: 22, uspsBillable: 19 }); // dimensional weight
    expect(page.items[0].busiest.LV.usps).toBeGreaterThan(0);
    const detail = await loadProductItem(page.items[0].id);
    expect(detail?.rows).toHaveLength(42);
    expect((await loadProductPage(run.id, { q: "box" }, {})).items.map((i) => i.partNumber)).toEqual(["P2"]);
    expect((await loadProductPage(run.id, { filter: "nodata" }, {})).total).toBe(1);
  });

  it("keeps products already quoted when Salsify stops answering part-way", async () => {
    const page1 = { data: [{ "salsify:id": "Q1", ...ship("1", "8", "6", "4") }, { "salsify:id": "Q2", ...ship("2", "10", "8", "4") }], meta: { cursor: "next", total_entries: 4 } };
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++calls === 1 ? new Response(JSON.stringify(page1)) : new Response("{}", { status: 403 }))));
    const { run, finished } = await startProductRun(user);
    await finished;
    const r = await prisma.productRateRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(r.status).toBe("FAILED");
    expect(r.error).toMatch(/^Salsify stopped answering after 2 of 4 products/);
    expect(await prisma.productRateItem.count({ where: { runId: run.id, status: "OK" } })).toBe(2);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(list))));
  });

  it("refuses a second run while one is going, and marks interrupted runs failed", async () => {
    await prisma.productRateRun.create({ data: { mode: "simulated", status: "RUNNING", listId: "12345" } });
    await expect(startProductRun(user)).rejects.toThrow("already in progress");
    await failInterruptedJobs();
    expect(await prisma.productRateRun.count({ where: { status: "RUNNING" } })).toBe(0);
  });

  it("keeps only the newest runs", async () => {
    for (let i = 0; i < 3; i++) await prisma.productRateRun.create({ data: { mode: "simulated", status: "READY", listId: "12345", createdAt: new Date(Date.now() - (i + 5) * 86400000) } });
    const before = await prisma.productRateRun.count();
    expect(await pruneProductRuns(2)).toBe(before - 2);
    expect(await prisma.productRateRun.count()).toBe(2);
  });
});
