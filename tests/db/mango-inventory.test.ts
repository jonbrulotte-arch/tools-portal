import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

const enabled = !!process.env.TEST_DATABASE_URL;
const page = readFileSync(path.join(__dirname, "..", "fixtures", "mango-inventory-56831.html"), "utf8");

describe.skipIf(!enabled)("Mango inventory import (database)", async () => {
  const { prisma } = await import("@/lib/prisma");
  const { setSetting, SETTING_DEFAULTS, getSetting } = await import("@/lib/settings");
  const { startInventoryImport, refreshItemInventory, inventoryStatus } = await import("@/lib/shipping/mango-inventory");
  let server: http.Server;
  let mangoUp = true;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const it = new URL(req.url!, "http://x").searchParams.get("it");
      if (!mangoUp) return res.writeHead(500).end("down");
      if (it === "56831") return res.writeHead(200, { "content-type": "text/html" }).end(page);
      if (it === "CHANGED") return res.writeHead(200).end(page.replace(/Quantity Site/g, "Qty Site").replace(/Item <b>56831/, "Item <b>CHANGED"));
      res.writeHead(200).end("<html><body>No item found</body></html>");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/orders/project-mango/current_inventory`;
    await setSetting("shippingRates", { ...SETTING_DEFAULTS.shippingRates, mangoInventory: { ...SETTING_DEFAULTS.shippingRates.mangoInventory, url } });
    await prisma.productInventory.deleteMany();
    await prisma.inventoryImportRun.deleteMany();
    await prisma.productRateRun.deleteMany();
    await prisma.productRateRun.create({
      data: { mode: "live", status: "READY", listId: "s-x", done: 3, items: { create: ["56831", "CHANGED", "00000"].map((partNumber, position) => ({ partNumber, position, status: "OK" as const })) } },
    });
  });
  afterAll(async () => {
    server?.close();
    await prisma.setting.deleteMany({ where: { key: "shippingRates" } });
  });

  it("imports every item on the latest Products run, recording layout problems as errors", async () => {
    const { finished } = await startInventoryImport({ id: null, email: "tester" });
    await finished;
    const rows = Object.fromEntries((await prisma.productInventory.findMany()).map((r) => [r.partNumber, r]));
    expect(rows["56831"]).toMatchObject({ stock: { LV: { onHand: 0, allocated: 0 }, GV: { onHand: 1319, allocated: 16 } }, shipments: { GV: 2 }, otherShipments: 1, unitsLastMonth: 189, error: null });
    expect(rows.CHANGED.error).toMatch(/not recognised: no "Quantity Site" columns/);
    expect(rows["00000"].error).toMatch(/unknown item, or the page layout changed/);
    const st = await inventoryStatus();
    expect(st.last).toMatchObject({ status: "READY", total: 3, done: 3, failed: 2 });
    expect(st.withErrors).toBe(2);
  });

  it("keeps the last good figures when a refresh fails", async () => {
    mangoUp = false;
    const item = await refreshItemInventory(await getSetting("shippingRates"), "56831");
    mangoUp = true;
    expect(item.error).toMatch(/HTTP 500/);
    expect(item.stock.GV.onHand).toBe(1319);
    const ok = await refreshItemInventory(await getSetting("shippingRates"), "56831");
    expect(ok.error).toBeNull();
  });
});
