import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MangoLayoutError, parseInventoryPage, summarizeInventory, upsAccountOf } from "@/lib/shipping/mango-inventory-parse";

const page = readFileSync(path.join(__dirname, "fixtures", "mango-inventory-56831.html"), "utf8");
const UPS_ACCOUNTS = { "796305": "LV", W293F5: "LV", "9X0F56": "GV", "9X0F53": "GV" };

describe("Mango inventory page", () => {
  it("reads stock per site from the newest snapshot", () => {
    const p = parseInventoryPage(page, "56831");
    expect(p.sites).toEqual({ "0": { onHand: 0, allocated: 0 }, "1": { onHand: 0, allocated: 0 }, "3": { onHand: 1319, allocated: 16 } });
    expect(p.snapshotAt).toBe("11/19 - 05:32pm");
    expect(p.unitsLastMonth).toBe(189);
    expect(p.description).toBe("DEW-RAK-DXST4500 4ft 3-Shlf Indust Rack Yellow");
  });

  it("keeps shipped orders only, with the UPS account from the tracking number and this item's quantity", () => {
    const p = parseInventoryPage(page, "56831");
    expect(p.shipments).toEqual([
      { status: "Complete", tracking: "1Z9X0F530300000001", carrier: "GND", upsAccount: "9X0F53", qty: 1 },
      { status: "InvoiceComplete", tracking: "1Z9X0F560300000002", carrier: "GND", upsAccount: "9X0F56", qty: 2 },
      { status: "InvoiceComplete", tracking: "0800000003", carrier: "ESTES", upsAccount: null, qty: 8 },
    ]); // the untracked HD Supply order and the cancelled one are skipped
  });

  it("maps sites and UPS accounts to warehouses (Buffalo ignored)", () => {
    const s = summarizeInventory(parseInventoryPage(page, "56831"), { "0": "LV", "3": "GV" }, UPS_ACCOUNTS);
    expect(s).toEqual({ stock: { LV: { onHand: 0, allocated: 0 }, GV: { onHand: 1319, allocated: 16 } }, shipments: { GV: 2 }, collectShipments: {}, shipmentCarriers: { "UPS pending": 2 }, otherShipments: 1 });
  });

  it("places other carriers' shipments by the cost reports' tracking-number record", () => {
    const tracked = new Map([["0800000003", { origin: "LV", carrier: "USPS" }]]);
    const s = summarizeInventory(parseInventoryPage(page, "56831"), { "0": "LV", "3": "GV" }, UPS_ACCOUNTS, tracked);
    expect(s).toMatchObject({ shipments: { GV: 2, LV: 1 }, shipmentCarriers: { "UPS pending": 2, USPS: 1 }, otherShipments: 0 });
  });

  it("tells UPS shipments we paid for from collect/third-party ones, by the cost reports' record", () => {
    const tracked = new Map([
      ["1Z9X0F530300000001", { origin: "GV", carrier: "UPS", billing: "collect" }],
      ["0800000003", { origin: "LV", carrier: "USPS", billing: "prepaid" }],
    ]);
    const s = summarizeInventory(parseInventoryPage(page, "56831"), { "0": "LV", "3": "GV" }, UPS_ACCOUNTS, tracked);
    expect(s).toMatchObject({ shipments: { GV: 2, LV: 1 }, collectShipments: { GV: 1 }, shipmentCarriers: { "UPS collect": 1, "UPS pending": 1, USPS: 1 } });
  });

  it("refuses pages it doesn't recognise instead of reading zero stock", () => {
    expect(() => parseInventoryPage(page, "99999")).toThrow(/page is for item 56831/);
    expect(() => parseInventoryPage("<html><body>Item not found</body></html>", "56831")).toThrow(MangoLayoutError);
    expect(() => parseInventoryPage(page.replace(/Quantity Site/g, "Qty at site"), "56831")).toThrow(/no "Quantity Site" columns/);
    expect(() => parseInventoryPage(page.replace(/<th>Update Date<\/th>/, "<th>Updated</th>"), "56831")).toThrow(/no inventory snapshot table/);
  });

  it("reads the shipper account from UPS tracking numbers only", () => {
    expect(upsAccountOf("1Z9X0F530300000001")).toBe("9X0F53");
    expect(upsAccountOf("1z796305aa00000001")).toBe("796305");
    expect(upsAccountOf("9400100000000000000303")).toBeNull();
    expect(upsAccountOf("0800000003")).toBeNull();
  });
});
