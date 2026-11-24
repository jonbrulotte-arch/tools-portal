import ExcelJS from "exceljs";
import { PACKAGING_TYPE_LABELS, FIT_LABELS, type PackagingType, type ShipmentAnalysis } from "@/lib/packaging/engine";
import type { StoredReport } from "@/lib/packaging/jobs";
import { normalizeVerdict, VERDICT_LABELS } from "@/lib/packaging/review";

// Spreadsheet templates, imports and exports for the Packaging Configurator (same column names as the
// stand-alone app, so its files still import).

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
type Cell = string | number | boolean | null | undefined;
type Sheet = { name: string; headers: string[]; rows: Cell[][]; widths?: number[] };

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
  }
  return String(v).trim();
}

/** The first sheet's rows as { normalizedHeader: text }, with their spreadsheet row numbers. CSV works too. */
export async function readRows(buf: Buffer, fileName: string): Promise<{ row: number; get: (...keys: string[]) => string }[]> {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(fileName)) {
    const { Readable } = await import("node:stream");
    await wb.csv.read(Readable.from(buf));
  } else {
    try {
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
    } catch {
      throw new Error("That file couldn't be read. Upload an .xlsx (Excel) or .csv file.");
    }
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("The file has no sheets.");
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (headers[i] = norm(cellText(c.value))));
  const out: { row: number; get: (...keys: string[]) => string }[] = [];
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const values: Record<string, string> = {};
    r.eachCell({ includeEmpty: false }, (c, i) => {
      if (headers[i]) values[headers[i]] = cellText(c.value);
    });
    if (!Object.values(values).some(Boolean)) return;
    out.push({ row: n, get: (...keys) => keys.map((k) => values[norm(k)]).find((v) => v != null && v !== "") ?? "" });
  });
  return out;
}

export async function workbook(sheets: Sheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.addRow(s.headers).font = { bold: true };
    for (const r of s.rows) ws.addRow(r.map((v) => (v == null ? "" : v)));
    ws.columns.forEach((c, i) => (c.width = s.widths?.[i] ?? Math.max(10, Math.min(40, (s.headers[i]?.length ?? 8) + 4))));
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const n = (v: string) => (v === "" ? NaN : Number(v.replace(/[^\d.-]/g, "")));
const yes = (v: string) => ["1", "true", "yes", "y", "x"].includes(v.toLowerCase());

// ─── Configurator items and bulk shipments ───────────────────────────────────

export const ITEMS_TEMPLATE: Sheet = { name: "Shipment", headers: ["Part Number", "Quantity"], rows: [["SKU-001", 1], ["SKU-002", 3]], widths: [20, 10] };
export const BULK_TEMPLATE: Sheet = {
  name: "Shipments",
  headers: ["Grouping ID", "Part Number", "Quantity"],
  rows: [["ORDER-1001", "SKU-001", 2], ["ORDER-1001", "SKU-002", 1], ["ORDER-1002", "SKU-003", 3]],
  widths: [16, 20, 10],
};

const PART = ["Part Number", "Product ID", "SKU", "ID", "UPC"];
const QTY = ["Quantity", "Qty"];

export async function parseItems(buf: Buffer, fileName: string) {
  const items: { partNumber: string; quantity: number }[] = [];
  const errors: string[] = [];
  for (const r of await readRows(buf, fileName)) {
    const partNumber = r.get(...PART);
    const quantity = Math.round(n(r.get(...QTY) || "1"));
    if (!partNumber) errors.push(`Row ${r.row}: no part number, skipped`);
    else if (!Number.isFinite(quantity) || quantity < 1) errors.push(`Row ${r.row}: quantity isn't a whole number of 1 or more, skipped`);
    else items.push({ partNumber, quantity });
  }
  return { items: items.slice(0, 200), errors: items.length > 200 ? [...errors, `Only the first 200 lines were used (the file has ${items.length})`] : errors };
}

/** Lines grouped by shipment (Grouping ID / Order ID). Lines without one are each their own shipment. */
export async function parseBulk(buf: Buffer, fileName: string, maxShipments = 5000) {
  const groups = new Map<string, { partNumber: string; quantity: number }[]>();
  const errors: string[] = [];
  for (const r of await readRows(buf, fileName)) {
    const id = r.get("Grouping ID", "Order ID", "Shipment ID", "Order", "Group ID") || `Row ${r.row}`;
    const partNumber = r.get(...PART);
    const quantity = Math.round(n(r.get(...QTY) || "1"));
    if (!partNumber) {
      errors.push(`Row ${r.row}: no part number, skipped`);
      continue;
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      errors.push(`Row ${r.row}: quantity isn't a whole number of 1 or more, skipped`);
      continue;
    }
    if (!groups.has(id) && groups.size >= maxShipments) throw new Error(`The file has more than ${maxShipments.toLocaleString("en-US")} shipments; split it into smaller files.`);
    groups.set(id, [...(groups.get(id) ?? []), { partNumber, quantity }]);
  }
  return { groups, errors };
}

// ─── Packaging ───────────────────────────────────────────────────────────────

const PACKAGING_HEADERS = ["Name", "Type", "Height (Inches)", "Width (Inches)", "Length (Inches)", "Max Height (Inches)", "Max Weight (Pounds)", "Packaging Weight (Pounds)", "Notes", "Active"];
export const PACKAGING_TEMPLATE: Sheet = {
  name: "Packaging",
  headers: PACKAGING_HEADERS,
  rows: [
    ["Small Box 6x4x3", "box", 3, 4, 6, "", 10, 0.3, "", 1],
    ["Medium Box 12x10x8", "box", 8, 10, 12, "", 30, 0.6, "", 1],
    ["Bubble Mailer 6x9", "bubble_mailer", 0.25, 6, 9, 0.75, 2, 0.1, "", 1],
    ["Poly Mailer 10x13", "poly_mailer", 0.1, 10, 13, 1, 3, 0.05, "", 1],
  ],
  widths: [24, 16, 14, 14, 14, 18, 18, 22, 24, 8],
};

const TYPE_ALIASES: Record<string, PackagingType> = { box: "box", boxes: "box", bubblemailer: "bubble_mailer", bubblemailers: "bubble_mailer", polymailer: "poly_mailer", polymailers: "poly_mailer", other: "other" };

export type PackagingRow = { name: string; type: PackagingType; height: number; width: number; length: number; maxHeight: number | null; maxWeight: number | null; tareWeight: number | null; notes: string | null; active: boolean };

export async function parsePackaging(buf: Buffer, fileName: string) {
  const rows: PackagingRow[] = [];
  const errors: string[] = [];
  for (const r of await readRows(buf, fileName)) {
    const name = r.get("Name", "Packaging");
    const type = TYPE_ALIASES[norm(r.get("Type") || "box")];
    const [height, width, length] = [r.get("Height (Inches)", "Height", "H"), r.get("Width (Inches)", "Width", "W"), r.get("Length (Inches)", "Length", "L")].map(n);
    const opt = (v: string) => (v === "" ? null : n(v));
    const maxHeight = opt(r.get("Max Height (Inches)", "Max Height"));
    const maxWeight = opt(r.get("Max Weight (Pounds)", "Max Weight"));
    const tareWeight = opt(r.get("Packaging Weight (Pounds)", "Packaging Weight", "Tare Weight", "Tare"));
    if (!name) errors.push(`Row ${r.row}: no name, skipped`);
    else if (!type) errors.push(`Row ${r.row} (${name}): type must be box, bubble_mailer, poly_mailer or other`);
    else if (![height, width, length].every((x) => Number.isFinite(x) && x > 0)) errors.push(`Row ${r.row} (${name}): height, width and length must be numbers above 0`);
    else if ([maxHeight, maxWeight, tareWeight].some((x) => x != null && !(Number.isFinite(x) && x >= 0))) errors.push(`Row ${r.row} (${name}): max height, max weight and packaging weight must be numbers`);
    else if ((type === "bubble_mailer" || type === "poly_mailer") && !maxHeight) errors.push(`Row ${r.row} (${name}): mailers need a max height`);
    else rows.push({ name, type, height, width, length, maxHeight: maxHeight || null, maxWeight: maxWeight || null, tareWeight, notes: r.get("Notes") || null, active: r.get("Active") === "" ? true : yes(r.get("Active")) });
  }
  return { rows, errors };
}

export const packagingSheet = (rows: PackagingRow[]): Sheet => ({
  name: "Packaging",
  headers: PACKAGING_HEADERS,
  rows: rows.map((p) => [p.name, p.type, p.height, p.width, p.length, p.maxHeight, p.maxWeight, p.tareWeight, p.notes, p.active ? 1 : 0]),
  widths: PACKAGING_TEMPLATE.widths,
});

// ─── Rate cards ──────────────────────────────────────────────────────────────

const RATE_HEADERS = ["Method Name", "Up To Weight (lbs)", "Rate ($)"];
export const RATES_TEMPLATE: Sheet = {
  name: "Rates",
  headers: RATE_HEADERS,
  rows: [["USPS Ground Advantage", 1, 4.5], ["USPS Ground Advantage", 2, 5.1], ["UPS Ground", 1, 8.9], ["UPS Ground", 5, 11.4]],
  widths: [28, 18, 10],
};

/** Rate cards per method name (lower-cased); later rows win on a repeated break. */
export async function parseRates(buf: Buffer, fileName: string, methodIds: Map<string, string>) {
  const cards = new Map<string, Map<number, number>>();
  const errors: string[] = [];
  for (const r of await readRows(buf, fileName)) {
    const name = r.get("Method Name", "Method", "Name");
    const maxWeight = n(r.get("Up To Weight (lbs)", "Up To Weight", "Max Weight", "Weight"));
    const rate = n(r.get("Rate ($)", "Rate", "Price", "Cost"));
    const id = methodIds.get(name.toLowerCase());
    if (!name) errors.push(`Row ${r.row}: no method name, skipped`);
    else if (!id) errors.push(`Row ${r.row}: there's no shipping method called "${name}", skipped`);
    else if (!(maxWeight > 0)) errors.push(`Row ${r.row}: weight must be above 0, skipped`);
    else if (!(rate >= 0)) errors.push(`Row ${r.row}: rate must be a number, skipped`);
    else cards.set(id, (cards.get(id) ?? new Map()).set(maxWeight, rate));
  }
  return { cards, errors };
}

export const ratesSheet = (rows: { method: string; maxWeight: number; rate: number }[]): Sheet => ({ name: "Rates", headers: RATE_HEADERS, rows: rows.map((r) => [r.method, r.maxWeight, r.rate]), widths: RATES_TEMPLATE.widths });

// ─── Results ─────────────────────────────────────────────────────────────────

const dims = (d: { height: number; width: number; length: number }) => `${d.height} × ${d.width} × ${d.length}`;
const methodsText = (ms: { methodName: string; billedWeight: number; dimApplied: boolean; rate: number | null }[]) =>
  ms.map((m) => `${m.methodName}: ${m.billedWeight} lb${m.dimApplied ? " (DIM)" : ""}${m.rate != null ? ` $${m.rate.toFixed(2)}` : ""}`).join("; ");

/** One shipment: its products, then every packaging option. */
export function shipmentSheets(a: ShipmentAnalysis): Sheet[] {
  const sheets: Sheet[] = [
    {
      name: "Products",
      headers: ["Part Number", "Name", "Height (in)", "Width (in)", "Length (in)", "Unit weight (lb)", "Quantity", "Line weight (lb)", "Foldable", "Ships in own packaging"],
      rows: [...a.items.map((i) => [i.product.partNumber, i.product.name, i.product.height, i.product.width, i.product.length, i.product.weight, i.quantity, Math.round(i.product.weight * i.quantity * 1000) / 1000, i.product.foldable ? "Yes" : "", i.product.shipsOwn ? "Yes" : ""]), ["", "", "", "", "", "", "Total", a.totalActualWeight]],
      widths: [18, 32, 11, 11, 11, 15, 10, 15, 10, 20],
    },
    {
      name: "Packaging options",
      headers: ["Rank", "Packaging", "Type", "Inner H × W × L (in)", "Shipped H × W × L (in)", "Utilization (%)", "Fit", "Products (lb)", "Packaging (lb)", "Actual (lb)", "DIM (lb)", "Billed (lb)", "DIM on every method", "Overweight", "Shipping methods"],
      rows: a.results.map((r, i) => [i + 1, r.packaging.name, PACKAGING_TYPE_LABELS[r.packaging.type], dims(r.packaging), dims(r.shippedDims), r.volumeUtilization, FIT_LABELS[r.fitQuality], r.productsWeight, r.packagingWeight, r.actualWeight, r.dimWeight, r.billedWeight, r.dimFlag ? "Yes" : "No", r.overweight ? "Yes" : "No", methodsText(r.shipping)]),
      widths: [6, 26, 14, 20, 20, 14, 11, 12, 13, 11, 9, 11, 18, 11, 60],
    },
  ];
  if (a.standalone.length)
    sheets.push({
      name: "Ships in own packaging",
      headers: ["Part Number", "Name", "Quantity", "DIM per unit (lb)", "Billed per unit (lb)", "Billed total (lb)", "Shipping methods (per unit)"],
      rows: a.standalone.map((s) => [s.product.partNumber, s.product.name, s.quantity, s.unitDimWeight, s.unitBilledWeight, s.totalBilledWeight, methodsText(s.shipping)]),
      widths: [18, 32, 10, 16, 18, 16, 60],
    });
  return sheets;
}

export type BulkShipment = { id: string; lines: string; units: number; analysis: ShipmentAnalysis | null; error: string | null };

export function bulkSheet(shipments: BulkShipment[]): Sheet {
  return {
    name: "Results",
    headers: ["Grouping ID", "Items", "Units", "Products (lb)", "Packaging (lb)", "Actual (lb)", "Billed (lb)", "Recommended packaging", "Shipping Height (Inches)", "Shipping Width (Inches)", "Shipping Length (Inches)", "Fit", "Utilization (%)", "DIM (lb)", "DIM on every method", "Overweight", "Cheapest method", "Cheapest rate ($)", "Ships in own packaging", "LTL", "Error"],
    rows: shipments.map((s) => {
      const best = s.analysis?.results[0];
      const cheap = best?.shipping.filter((m) => m.rate != null).sort((x, y) => x.rate! - y.rate!)[0];
      return [
        s.id,
        s.lines,
        s.units,
        best?.productsWeight,
        best?.packagingWeight,
        best?.actualWeight,
        best?.billedWeight,
        best?.packaging.name,
        best?.shippedDims.height,
        best?.shippedDims.width,
        best?.shippedDims.length,
        best ? FIT_LABELS[best.fitQuality] : "",
        best?.volumeUtilization,
        best?.dimWeight,
        best ? (best.dimFlag ? "Yes" : "No") : "",
        best ? (best.overweight ? "Yes" : "No") : "",
        cheap?.methodName,
        cheap?.rate,
        s.analysis?.standalone.map((x) => `${x.product.partNumber} ×${x.quantity}`).join(", "),
        s.analysis?.ltlRequired ? "Yes" : "",
        s.error ?? (s.analysis && !best && s.analysis.items.some((i) => !i.product.shipsOwn) && !s.analysis.ltlRequired ? "No packaging fits" : ""),
      ];
    }),
    widths: [16, 34, 8, 13, 14, 11, 11, 26, 14, 14, 14, 11, 13, 9, 18, 11, 22, 15, 24, 6, 30],
  };
}

/** The catalog report: summary, packaging use, gaps and every product. */
export function reportSheets(r: StoredReport, computedAt: string): Sheet[] {
  const pct = (v: number | null) => (v == null ? "" : v);
  return [
    {
      name: "Summary",
      headers: ["Measure", "Value"],
      rows: [
        ["Computed", computedAt],
        ["Products checked", r.products],
        ["Products missing size or weight in Salsify (not checked)", r.incomplete],
        ["Packaging options (active)", r.packaging],
        ["Shipping methods (parcel)", r.methods],
        ["Products with packaging", r.covered],
        ["Coverage (%)", r.coverageRate],
        ["No packaging fits", r.noFit],
        ["Only loose or oversized fits", r.looseOnly],
        ["Billed by DIM on at least one method", r.dimExposed],
        ["DIM exposure (%)", r.dimExposureRate],
        ...(r.review
          ? ([
              ["Products with a packaged size in Salsify", r.review.withPacked],
              ...Object.entries(r.review.counts).map(([k, v]) => [`Review: ${VERDICT_LABELS[normalizeVerdict(k)]}`, v]),
              ["Review: total saving if each shipped once ($)", r.review.savingRate],
              ["Review: total saving (lb billed)", r.review.savingLb],
            ] as Cell[][])
          : []),
        ["DIM divisor", r.settings.dimDivisor],
        ["Pack efficiency", r.settings.packEfficiency],
        ["Fit clearance (in)", r.settings.fitClearance],
      ],
      widths: [52, 26],
    },
    {
      name: "Packaging use",
      headers: ["Packaging", "Type", "H × W × L (in)", "Products it fits", "Best fit for", "Only option for", "Exact", "Good", "Loose", "Oversized", "Avg utilization (%)"],
      rows: r.packagingStats.map((p) => [p.name, PACKAGING_TYPE_LABELS[p.type], dims(p.dims), p.fits, p.bestFits, p.soleOption, p.quality.exact, p.quality.good, p.quality.loose, p.quality.large, pct(p.avgUtilization)]),
      widths: [28, 14, 18, 16, 12, 15, 8, 8, 8, 10, 18],
    },
    {
      name: "DIM by method",
      headers: ["Shipping method", "Products billed by DIM", "Share of products (%)"],
      rows: r.dimByMethod.map((m) => [m.methodName, m.count, m.pct]),
      widths: [30, 22, 20],
    },
    {
      name: "Coverage gaps",
      headers: ["Part Number", "Name", "Issue", "Height (in)", "Width (in)", "Length (in)", "Weight (lb)", "Foldable"],
      rows: r.results
        .filter((x) => (!x.shipsOwn && x.packagingId == null) || x.fitQuality === "loose" || x.fitQuality === "large")
        .map((x) => [x.partNumber, x.name, x.packagingId == null ? "No packaging fits" : "Only loose or oversized fits", x.height, x.width, x.length, x.weight, x.foldable ? "Yes" : ""]),
      widths: [18, 34, 28, 11, 11, 11, 11, 10],
    },
    {
      name: "Packaging review",
      headers: ["Part Number", "Name", "Verdict", "Packaged L (in)", "Packaged W (in)", "Packaged H (in)", "Packaged weight (lb)", "Looks like", "Today billed (lb)", "Today cheapest", "Today rate ($)", "Recommended packaging", "Recommended L × W × H (in)", "Recommended billed (lb)", "Recommended cheapest", "Recommended rate ($)", "Saving per shipment ($)", "Saving (lb billed)"],
      rows: r.results
        .filter((x) => x.review)
        .sort((a, b) => (b.review!.savingRate ?? b.review!.savingLb ?? -1e9) - (a.review!.savingRate ?? a.review!.savingLb ?? -1e9))
        .map((x) => {
          const v = x.review!;
          return [
            x.partNumber,
            x.name,
            VERDICT_LABELS[normalizeVerdict(v.verdict)],
            v.current?.dims.length,
            v.current?.dims.width,
            v.current?.dims.height,
            v.current?.weight,
            v.current?.matches,
            v.current?.billedWeight,
            v.current?.cheapest?.methodName,
            v.current?.cheapest?.rate,
            x.packagingName ?? "No packaging fits",
            x.shippedDims ? dims(x.shippedDims) : "",
            x.billedWeight,
            x.cheapest?.methodName,
            x.cheapest?.rate,
            v.savingRate,
            v.savingLb,
          ];
        }),
      widths: [18, 32, 34, 14, 14, 14, 18, 22, 16, 22, 14, 26, 24, 20, 22, 18, 20, 16],
    },
    {
      name: "Products",
      headers: ["Part Number", "Name", "Height (in)", "Width (in)", "Length (in)", "Weight (lb)", "Foldable", "Ships in own packaging", "Best packaging", "Fit", "Utilization (%)", "Options", "Shipping Height (Inches)", "Shipping Width (Inches)", "Shipping Length (Inches)", "Actual (lb)", "DIM (lb)", "Billed (lb)", "DIM-billed on", "Cheapest method", "Cheapest rate ($)"],
      rows: r.results.map((x) => [
        x.partNumber,
        x.name,
        x.height,
        x.width,
        x.length,
        x.weight,
        x.foldable ? "Yes" : "",
        x.shipsOwn ? "Yes" : "",
        x.packagingName ?? "No packaging fits",
        x.fitQuality ? FIT_LABELS[x.fitQuality] : "",
        pct(x.volumeUtilization),
        x.options,
        x.shippedDims?.height,
        x.shippedDims?.width,
        x.shippedDims?.length,
        x.actualWeight,
        x.dimWeight,
        x.billedWeight,
        x.dimMethods.map((m) => m.methodName).join(", "),
        x.cheapest?.methodName,
        x.cheapest?.rate,
      ]),
      widths: [18, 34, 11, 11, 11, 11, 10, 20, 26, 11, 14, 9, 14, 14, 14, 11, 9, 11, 28, 22, 15],
    },
  ];
}


