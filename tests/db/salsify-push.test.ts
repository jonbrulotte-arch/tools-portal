import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!enabled)("Blended cost push to Salsify (database)", async () => {
  const { prisma } = await import("@/lib/prisma");
  const { setSetting, SETTING_DEFAULTS } = await import("@/lib/settings");
  const { setUserSecret } = await import("@/lib/user-credentials");
  const { startSalsifyPush, testSalsifyPush, pushOne } = await import("@/lib/shipping/salsify-push");
  const { usageDay } = await import("@/lib/shipping/api-usage");

  let user = { id: "", email: "push@example.com" };
  const writes: { part: string; body: Record<string, string[]> }[] = [];

  const quotes = (amount: number) =>
    ["LV", "GV"].flatMap((origin) => [4, 8].flatMap((zone) => ["GROUND_ADVANTAGE", "GROUND_COM", "GROUND_RES"].map((service) => ({ origin, zone, service, carrier: service === "GROUND_ADVANTAGE" ? "USPS" : "UPS", destZip: "10001", amount: amount + zone }))));

  beforeAll(async () => {
    for (const m of [prisma.salsifyPushRun, prisma.salsifyPush, prisma.productRateRun, prisma.shippingReport, prisma.productInventory]) await (m as { deleteMany: () => Promise<unknown> }).deleteMany();
    await prisma.user.deleteMany({ where: { email: user.email } });
    const role = (await prisma.role.findFirst()) ?? (await prisma.role.create({ data: { name: "Tester role" } }));
    const u = await prisma.user.create({ data: { email: user.email, name: "Push tester", roleId: role.id, status: "ACTIVE" } });
    user = { id: u.id, email: u.email };
    await setUserSecret(u.id, "salsify", "test-key-123456");
    const d = SETTING_DEFAULTS.shippingRates;
    await setSetting("shippingRates", {
      ...d,
      mode: "live",
      salsify: { ...d.salsify, orgId: "s-org" },
      productRates: { ...d.productRates, listId: "s-list", keyUserId: u.id },
      salsifyPush: { ...d.salsifyPush, property: "Blended Shipping Cost" },
    });
    // cost report: each warehouse ships half to zone 4, half to zone 8
    await prisma.shippingReport.create({
      data: {
        fileName: "r.xlsx",
        status: "READY",
        aggregates: { create: ["LV", "GV"].flatMap((origin) => [4, 8].map((zone) => ({ carrier: "UPS", service: "GROUND_COM", origin, zone, zoneSource: "actual", weight: 2, count: 50, total: 500, minCost: 9, maxCost: 11 }))) },
      },
    });
    await prisma.productRateRun.create({
      data: {
        mode: "live",
        status: "READY",
        listId: "s-list",
        done: 3,
        items: {
          create: [
            { partNumber: "A1", position: 0, status: "OK", quotes: { create: quotes(10) } },
            { partNumber: "MISSING", position: 1, status: "OK", quotes: { create: quotes(20) } },
            { partNumber: "N1", position: 2, status: "NO_DATA", error: "Salsify has no weight" },
          ],
        },
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const path = new URL(url).pathname;
        if (path.includes("/properties/"))
          return decodeURIComponent(path.split("/").pop()!) === "Blended Shipping Cost"
            ? new Response(JSON.stringify({ "salsify:id": "Blended Shipping Cost", "salsify:data_type": "string", "salsify:is_multi_valued": true }))
            : new Response("{}", { status: 404 });
        const part = decodeURIComponent(path.split("/").pop()!);
        if (part === "MISSING") return new Response("{}", { status: 404 });
        if (init.method === "PUT") {
          writes.push({ part, body: JSON.parse(String(init.body)) });
          return new Response("{}");
        }
        const last = writes.filter((w) => w.part === part).at(-1);
        return new Response(JSON.stringify({ "salsify:id": part, ...(last?.body ?? {}) }));
      }),
    );
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.productRateRun.deleteMany();
    await prisma.shippingReport.deleteMany();
    await prisma.setting.deleteMany({ where: { key: "shippingRates" } });
  });

  it("writes [cost, note, date] for changed products, and reports skipped and failed ones", async () => {
    const { run, finished } = await startSalsifyPush(user);
    await finished;
    const r = await prisma.salsifyPushRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(r).toMatchObject({ status: "READY", products: 3, done: 3, written: 1, unchanged: 0, skipped: 1, failed: 1, property: "Blended Shipping Cost" });
    expect(r.problems).toEqual([
      { partNumber: "N1", reason: "Not quoted: Salsify has no weight" },
      { partNumber: "MISSING", reason: "Product MISSING isn't in Salsify" },
    ]);
    expect(writes).toHaveLength(1);
    const [cost, note, day] = writes[0].body["Blended Shipping Cost"];
    // no Mango data → company-wide split (50/50); cell = cheapest of USPS/UPS = 10 + zone; zones 4 and 8 half each → 16
    expect(cost).toBe("16.00");
    expect(note).toBe("No Mango data: company-wide split");
    expect(day).toBe(usageDay());
  });

  it("writes nothing the second time when nothing changed", async () => {
    const { run, finished } = await startSalsifyPush(user);
    await finished;
    expect(await prisma.salsifyPushRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ written: 0, unchanged: 1, skipped: 1, failed: 1 });
    expect(writes).toHaveLength(1);
  });

  it("tests the property, writes one product and reads it back", async () => {
    const { getSetting } = await import("@/lib/settings");
    const t = await testSalsifyPush(await getSetting("shippingRates"), user, "A1");
    expect(t).toMatchObject({ ok: true, writeBlocker: null });
    expect(t.message).toMatch(/A1 would get: "16.00", "No Mango data: company-wide split", "\d{4}-\d{2}-\d{2}"/);
    const one = await pushOne(await getSetting("shippingRates"), user, "A1");
    expect(one.readBack).toEqual(one.values);
  });

  it("explains why one product can't be written instead of greying the button out", async () => {
    const { getSetting } = await import("@/lib/settings");
    const s = await getSetting("shippingRates");
    await expect(pushOne(s, user, "NOT-ON-LIST")).rejects.toThrow(/NOT-ON-LIST isn't in the Products run of .*, the newest completed live run/);
    await expect(pushOne(s, user, "N1")).rejects.toThrow("N1 wasn't quoted: Salsify has no weight");
    await expect(pushOne({ ...s, salsifyPush: { ...s.salsifyPush, property: "Nope" } }, user, "A1")).rejects.toThrow('Salsify has no property "Nope"');
    await expect(pushOne({ ...s, mode: "simulated" }, user, "A1")).rejects.toThrow(/simulated mode/);
    const t = await testSalsifyPush({ ...s, mode: "simulated" }, user, "A1");
    expect(t.writeBlocker).toMatch(/simulated mode/);
    expect((await testSalsifyPush(s, user, "N1")).writeBlocker).toMatch(/wasn't quoted/);
  });

  it("never pushes simulated prices", async () => {
    const { getSetting } = await import("@/lib/settings");
    await setSetting("shippingRates", { mode: "simulated" });
    await expect(startSalsifyPush(user)).rejects.toThrow(/simulated mode; simulated prices are never pushed/);
    await setSetting("shippingRates", { mode: "live" });
    expect((await getSetting("shippingRates")).mode).toBe("live");
  });

  it("uses the newest COMPLETED live run: a newer cancelled, failed or simulated run doesn't hide products", async () => {
    const { getSetting } = await import("@/lib/settings");
    // newer runs without A1: one cancelled part-way, one failed, one simulated
    for (const [status, mode] of [["CANCELLED", "live"], ["FAILED", "live"], ["READY", "simulated"]] as const) {
      await prisma.productRateRun.create({ data: { mode, status, listId: "s-list", done: 1, items: { create: [{ partNumber: "N1", position: 0, status: "NO_DATA" }] } } });
    }
    const t = await testSalsifyPush(await getSetting("shippingRates"), user, "A1");
    expect(t.message).toMatch(/A1 would get: "16.00"/);
    expect(t.writeBlocker).toBeNull();
    const nope = await testSalsifyPush(await getSetting("shippingRates"), user, "ZZZ");
    expect(nope.writeBlocker).toMatch(/ZZZ isn't in the Products run of \w{3} \d+, \d{4}, the newest completed live run \(cancelled and failed runs aren't used\)/);
  });

  it("explains when no live run has completed", async () => {
    await prisma.productRateRun.updateMany({ where: { mode: "live", status: "READY" }, data: { status: "CANCELLED" } });
    await expect(startSalsifyPush(user)).rejects.toThrow(/no completed Products run with live prices yet/);
  });
});
