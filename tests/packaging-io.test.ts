import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { bulkSheet, parseBulk, parseItems, parsePackaging, parseRates, readRows, reportSheets, shipmentSheets, workbook, PACKAGING_TEMPLATE } from "@/lib/packaging/io";
import { mapPackagingProduct, pushBody, pushValuesFor } from "@/lib/packaging/jobs";
import { analyzeShipment, type Packaging } from "@/lib/packaging/engine";
import { analyzeCatalog, type ProductResult } from "@/lib/packaging/report";
import { SETTING_DEFAULTS } from "@/lib/settings";

async function xlsx(rows: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("S");
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("spreadsheet imports", () => {
  it("reads configurator lines with flexible headers and reports bad rows", async () => {
    const r = await parseItems(await xlsx([["SKU", "Qty"], ["A-1", 2], ["", 1], ["B-2", 0], ["C-3", ""]]), "x.xlsx");
    expect(r.items).toEqual([{ partNumber: "A-1", quantity: 2 }, { partNumber: "C-3", quantity: 1 }]);
    expect(r.errors).toEqual(["Row 3: no part number, skipped", "Row 4: quantity isn't a whole number of 1 or more, skipped"]);
  });

  it("groups bulk lines by grouping ID (CSV too)", async () => {
    const csv = Buffer.from("Order ID,Part Number,Quantity\nSO-1,A,1\nSO-1,B,2\nSO-2,A,3\n,C,1\n");
    const { groups, errors } = await parseBulk(csv, "orders.csv");
    expect([...groups.entries()]).toEqual([
      ["SO-1", [{ partNumber: "A", quantity: 1 }, { partNumber: "B", quantity: 2 }]],
      ["SO-2", [{ partNumber: "A", quantity: 3 }]],
      ["Row 5", [{ partNumber: "C", quantity: 1 }]],
    ]);
    expect(errors).toEqual([]);
    await expect(parseBulk(csv, "orders.csv", 2)).rejects.toThrow("more than 2 shipments");
  });

  it("imports the packaging template and checks each row", async () => {
    const template = await workbook([PACKAGING_TEMPLATE]);
    const ok = await parsePackaging(template, "packaging.xlsx");
    expect(ok.errors).toEqual([]);
    expect(ok.rows[2]).toEqual({ name: "Bubble Mailer 6x9", type: "bubble_mailer", height: 0.25, width: 6, length: 9, maxHeight: 0.75, maxWeight: 2, tareWeight: 0.1, notes: null, active: true });
    const bad = await parsePackaging(await xlsx([["Name", "Type", "Height", "Width", "Length", "Max Height"], ["Crate", "pallet", 1, 1, 1, ""], ["Mailer", "poly mailer", 0.1, 10, 13, ""], ["Box", "Boxes", 3, 4, "x", ""]]), "p.xlsx");
    expect(bad.rows).toEqual([]);
    expect(bad.errors).toEqual([
      "Row 2 (Crate): type must be box, bubble_mailer, poly_mailer or other",
      "Row 3 (Mailer): mailers need a max height",
      "Row 4 (Box): height, width and length must be numbers above 0",
    ]);
  });

  it("imports rate cards for known methods; later rows win", async () => {
    const ids = new Map([["ups ground", "m1"]]);
    const r = await parseRates(await xlsx([["Method Name", "Up To Weight (lbs)", "Rate ($)"], ["UPS Ground", 1, 9], ["UPS Ground", 1, 9.5], ["UPS Ground", 5, 12], ["FedEx", 1, 9]]), "r.xlsx", ids);
    expect([...r.cards.get("m1")!.entries()]).toEqual([[1, 9.5], [5, 12]]);
    expect(r.errors).toEqual(['Row 5: there\'s no shipping method called "FedEx", skipped']);
  });

  it("rejects a file that isn't a spreadsheet", async () => {
    await expect(readRows(Buffer.from("not a zip"), "x.xlsx")).rejects.toThrow("couldn't be read");
  });
});

describe("Salsify fields and the push", () => {
  const f = SETTING_DEFAULTS.packagingConfigurator.salsify.fields;
  it("maps the tool's own fields, flags and what's missing", () => {
    const ok = mapPackagingProduct("P1", { "Item Name": { "en-US": "Scarf" }, "UPC Length (Inches)": "16 in", "UPC Width (Inches)": 6, "UPC Height (Inches)": "1", "UPC Weight (Pounds)": "0.5", UPC: "0123", Foldable: true, "Ships in Own Packaging": "no" }, f);
    expect(ok).toEqual({ partNumber: "P1", name: "Scarf", length: 16, width: 6, height: 1, weight: 0.5, upc: "0123", foldable: true, shipsOwn: false, packedHeight: null, packedWidth: null, packedLength: null, packedWeight: null, error: null });
    // today's packaged size: all four, or none when one is missing
    const packed = { "Shipping Length (Inches)": "17", "Shipping Width (Inches)": "7", "Shipping Height (Inches)": "2", "Shipping Weight (Pounds)": "0.7" };
    expect(mapPackagingProduct("P1", packed, f)).toMatchObject({ packedLength: 17, packedWidth: 7, packedHeight: 2, packedWeight: 0.7 });
    expect(mapPackagingProduct("P1", { ...packed, "Shipping Weight (Pounds)": "" }, f)).toMatchObject({ packedLength: null, packedWeight: null });
    const missing = mapPackagingProduct("P2", { "UPC Length (Inches)": "16" }, f);
    expect(missing).toMatchObject({ name: "P2", width: null, error: 'Salsify has no width, height, weight (fields "UPC Width (Inches)", "UPC Height (Inches)", "UPC Weight (Pounds)")' });
  });

  it("writes the best packaging's sealed size and actual weight (not the billed weight) to the four properties", () => {
    // a 0.28 lb item in a mailer: billed 2 lb by DIM, but it weighs 0.33 lb with the mailer
    const r = { shippedDims: { height: 0.75, width: 5.5, length: 8.5 }, actualWeight: 0.33, billedWeight: 2 } as ProductResult;
    const v = pushValuesFor(r)!;
    expect(v).toEqual({ length: "8.5", width: "5.5", height: "0.75", weight: "0.33" });
    expect(pushBody(SETTING_DEFAULTS.packagingConfigurator, v)).toEqual({
      "Calculated Shipping Length (Inches)": "8.5",
      "Calculated Shipping Width (Inches)": "5.5",
      "Calculated Shipping Height (Inches)": "0.75",
      "Calculated Shipping Weight (Pounds)": "0.33",
    });
    expect(pushValuesFor({ shippedDims: null, billedWeight: null } as ProductResult)).toBeNull();
  });
});

describe("exports", () => {
  it("builds the shipment, bulk and report workbooks", async () => {
    const s = { dimDivisor: 139, packEfficiency: 0.7, ltlThreshold: 150, fitClearance: 0.5 };
    const box: Packaging = { id: "b", name: "Box", type: "box", height: 6, width: 8, length: 10, maxHeight: null, maxWeight: null, tareWeight: 0.5 };
    const product = { partNumber: "A", name: "A", height: 5, width: 7, length: 9, weight: 2, foldable: false, shipsOwn: false };
    const a = analyzeShipment([{ product, quantity: 1 }], [box], [], s);
    const sheets = shipmentSheets(a);
    expect(sheets.map((x) => x.name)).toEqual(["Products", "Packaging options"]);
    expect(sheets[1].rows[0].slice(0, 3)).toEqual([1, "Box", "Box"]);
    const bulk = bulkSheet([{ id: "SO-1", lines: "A ×1", units: 1, analysis: a, error: null }, { id: "SO-2", lines: "X ×1", units: 1, analysis: null, error: "Not on the list" }]);
    expect(bulk.rows[0][7]).toBe("Box");
    expect(bulk.rows[1][20]).toBe("Not on the list");
    const report = { ...(await analyzeCatalog([product], [box], [], s)), incomplete: 3 };
    const names = reportSheets(report, "2026-11-24").map((x) => x.name);
    expect(names).toEqual(["Summary", "Packaging use", "DIM by method", "Coverage gaps", "Packaging review", "Products"]);
    expect((await workbook(reportSheets(report, "2026-11-24"))).length).toBeGreaterThan(1000);
  });
});
