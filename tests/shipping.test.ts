import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { upsTier, uspsTier, uspsQuoteWeights, tierOunces, weightLabel } from "@/lib/shipping/weights";
import { findCutoff } from "@/lib/shipping/analysis";
import { rateCsvRows, rateRows } from "@/lib/shipping/rate-table";
import { buildUpsRateRequest, parseUpsRateResponse, buildEndiciaRateRequest, parseEndiciaRateResponse, simulatedQuote } from "@/lib/shipping/carriers";
import { distanceMiles, zoneForDistance, estimateZone, fitZoneBands, representativeZips, zipPoint } from "@/lib/shipping/geo";
import { parseReport } from "@/lib/shipping/report";
import { billable, upsDimWeight, uspsDimWeight } from "@/lib/shipping/dims";
import { mapProduct, plainValue } from "@/lib/salsify";
import { SETTING_DEFAULTS } from "@/lib/settings";

describe("weight tiers", () => {
  it("puts USPS weights in Ground Advantage tiers", () => {
    expect([0.1, 0.25, 0.3, 0.5, 0.7, 0.9, 1, 1.01, 2.5].map(uspsTier)).toEqual([0.25, 0.25, 0.5, 0.5, 0.75, 0.99, 1, 2, 3]);
    expect(uspsQuoteWeights(3)).toEqual([0.25, 0.5, 0.75, 0.99, 1, 2, 3]);
    expect(tierOunces(0.99)).toBe(15.99);
    expect(weightLabel(0.5)).toBe("8 oz");
    expect(weightLabel(0.99)).toBe("15.99 oz");
  });
  it("rounds UPS billed weight up to whole pounds, minimum 1", () => {
    expect([0, 0.2, 1, 1.2, 10].map(upsTier)).toEqual([1, 1, 1, 2, 10]);
  });
});

describe("UPS vs USPS cutoff", () => {
  const p = (weight: number, usps: number, ups: number) => ({ weight, usps, ups });
  it("is the lightest weight from which UPS stays cheaper", () => {
    expect(findCutoff([p(1, 8, 10), p(2, 10, 11), p(3, 12, 11.5), p(4, 14, 12)])).toBe(3);
  });
  it("ignores an early dip when USPS is cheaper again later", () => {
    expect(findCutoff([p(1, 8, 7), p(2, 10, 11), p(3, 12, 13)])).toBeNull();
  });
  it("ignores sub-pound tiers", () => {
    expect(findCutoff([p(0.5, 5, 4), p(1, 8, 9)])).toBeNull();
  });
  it("builds the rate-by-weight table and CSV", () => {
    const pts = (ups: number[]) => [1, 2].map((weight, i) => ({ weight, usps: [8, 12][i], ups: ups[i] }));
    const cx = [
      { origin: "LV", zone: 8, upsService: "GROUND_COM" as const, cutoff: 2, points: pts([9, 11]) },
      { origin: "LV", zone: 8, upsService: "GROUND_RES" as const, cutoff: null, points: pts([13, 15]) },
      { origin: "GV", zone: 4, upsService: "GROUND_COM" as const, cutoff: null, points: pts([9, 13]) },
    ];
    const rows = rateRows(cx, { origin: "LV", zone: 8 });
    expect(rows).toEqual([
      { origin: "LV", zone: 8, weight: 1, usps: 8, upsCom: 9, upsRes: 13, cheaperCom: "USPS", cheaperRes: "USPS" },
      { origin: "LV", zone: 8, weight: 2, usps: 12, upsCom: 11, upsRes: 15, cheaperCom: "UPS", cheaperRes: "USPS" },
    ]);
    expect(rateRows(cx)).toHaveLength(4);
    expect(rateCsvRows(rows, "live", [{ code: "LV", name: "Las Vegas, NV", zip: "89113" }])[1]).toEqual(["live", "Las Vegas, NV", "89113", 8, "2 lb", 2, "12.00", "11.00", "15.00", "UPS", "USPS"]);
  });
});

describe("zone estimate", () => {
  it("maps distance to zones", () => {
    expect([10, 150, 151, 600, 1500, 2500].map((d) => zoneForDistance(d))).toEqual([2, 2, 3, 4, 7, 8]);
  });
  it("places known destinations sensibly from Las Vegas", () => {
    expect(distanceMiles(zipPoint("89113")!, zipPoint("90001")!)).toBeGreaterThan(200);
    // Textbook bands put Los Angeles (~230 mi) in zone 3; learned bands (from UPS invoices) give the real zone 4.
    expect(estimateZone("89113", "Los Angeles", "CA")?.zone).toBe(3);
    expect(estimateZone("89113", "Los Angeles", "CA", { 2: 82, 3: 210, 4: 584, 5: 854, 6: 1399, 7: 1764 })?.zone).toBe(4);
    expect(estimateZone("89113", "New York", "NY")?.zone).toBe(8);
    expect(estimateZone("89113", "Honolulu", "HI")).toBeNull();
    expect(estimateZone("89113", "Glendale Hts", "IL")?.precision).toBe("city");
  });
  it("learns zone boundaries from shipments with known zones", () => {
    const pairs = [...Array.from({ length: 150 }, (_, i) => ({ miles: 50 + i, zone: 2 })), ...Array.from({ length: 150 }, (_, i) => ({ miles: 220 + i, zone: 4 }))];
    const b = fitZoneBands(pairs)!;
    expect(b[2]).toBeGreaterThanOrEqual(199);
    expect(b[2]).toBeLessThan(220);
    expect(fitZoneBands(pairs.slice(0, 10))).toBeNull();
  });
  it("picks a quote ZIP for every zone 2–8", () => {
    expect(Object.keys(representativeZips("43125")).map(Number).sort()).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("carrier formats", () => {
  const q = { carrier: "UPS" as const, service: "GROUND_RES" as const, origin: "LV", originZip: "89113", destZip: "10001", zone: 8, weight: 5 };
  it("builds a negotiated UPS Ground residential request", () => {
    const r = buildUpsRateRequest(q, "796305").RateRequest.Shipment;
    expect(r.Service.Code).toBe("03");
    expect(r.ShipmentRatingOptions.NegotiatedRatesIndicator).toBe("Y");
    expect(r.ShipTo.Address).toMatchObject({ PostalCode: "10001", ResidentialAddressIndicator: "Y" });
    expect(r.Package.PackageWeight.Weight).toBe("5");
  });
  it("prefers the negotiated UPS total", () => {
    expect(parseUpsRateResponse({ RateResponse: { RatedShipment: { TotalCharges: { MonetaryValue: "30.10" }, NegotiatedRateCharges: { TotalCharge: { MonetaryValue: "18.42" } } } } })).toMatchObject({ amount: 18.42, listAmount: 30.1 });
    expect(() => parseUpsRateResponse({ response: { errors: [{ message: "Invalid postal code" }] } })).toThrow("Invalid postal code");
  });
  it("builds and reads Endicia Ground Advantage rates", () => {
    const s = { ...SETTING_DEFAULTS.shippingRates, endicia: { ...SETTING_DEFAULTS.shippingRates.endicia, requesterId: "R1", accountId: "A1" } };
    const xml = buildEndiciaRateRequest(s, "p<w", { ...q, carrier: "USPS", service: "GROUND_ADVANTAGE", weight: 0.99 });
    expect(xml).toContain("<MailClass>GroundAdvantage</MailClass>");
    expect(xml).toContain("<WeightOz>15.99</WeightOz>");
    expect(xml).toContain("<PassPhrase>p&lt;w</PassPhrase>");
    expect(parseEndiciaRateResponse("<PostageRateResponse><Status>0</Status><Zone>8</Zone><Postage><Rate>9.87</Rate></Postage></PostageRateResponse>")).toEqual({ amount: 9.87, apiZone: "8" });
    expect(() => parseEndiciaRateResponse("<Status>12503</Status><ErrorMessage>Bad pass phrase</ErrorMessage>")).toThrow("Bad pass phrase");
  });
  it("simulated prices rise with weight and zone", () => {
    const a = simulatedQuote({ ...q, weight: 1, zone: 2 }).amount, b = simulatedQuote({ ...q, weight: 10, zone: 2 }).amount, c = simulatedQuote({ ...q, weight: 10, zone: 8 }).amount;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe("cost report processing", () => {
  async function workbook(rows: Record<string, string | number>[]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("UPS and USPS");
    const cols = ["shipsource", "transactiondate", "trackingnumber", "weight", "billedweight", "zone", "transactionamount", "originzip", "destinationname", "destinationcity", "destinationstate", "ups_chargeclasscode", "ups_chargedescription"];
    ws.addRow(cols);
    for (const r of rows) ws.addRow(cols.map((c) => r[c] ?? null));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it("sums UPS lines per package, keeps only prepaid shipping and places USPS zones", async () => {
    const file = await workbook([
      // LV prepaid package to Charlotte NC, zone 8: three lines
      { shipsource: "UPS", transactiondate: "2026-08-01", trackingnumber: "1Z7963050000000001", billedweight: "2", zone: "008", transactionamount: 9.35, ups_chargeclasscode: "FRT", ups_chargedescription: "Ground Residential", destinationname: "A Person", destinationcity: "CHARLOTTE", destinationstate: "NC" },
      { shipsource: "UPS", trackingnumber: "1Z7963050000000001", zone: "008", transactionamount: 2.92, ups_chargeclasscode: "ACC", ups_chargedescription: "Residential Surcharge" },
      { shipsource: "UPS", trackingnumber: "1Z7963050000000001", zone: "008", transactionamount: 2.25, ups_chargeclasscode: "FSC", ups_chargedescription: "Fuel Surcharge" },
      // Third-party package (billed to someone else): excluded
      { shipsource: "UPS", trackingnumber: "1Z7963050000000002", billedweight: "3", zone: "007", transactionamount: 0, ups_chargeclasscode: "FRT", ups_chargedescription: "Ground Commercial Third Party", destinationcity: "DALLAS", destinationstate: "TX" },
      // Groveport account package, zone 4
      { shipsource: "UPS", transactiondate: "2026-09-01", trackingnumber: "1Z9X0F560000000003", billedweight: "10", zone: "004", transactionamount: 12.5, ups_chargeclasscode: "FRT", ups_chargedescription: "Ground Commercial", destinationcity: "ATLANTA", destinationstate: "GA" },
      // USPS to Charlotte (zone learned from the UPS package), and to a city UPS never shipped to (distance)
      { shipsource: "USPS", transactiondate: "2026-08-02", trackingnumber: "9400000000000001", weight: "0.4", transactionamount: 6.1, originzip: "89113", destinationcity: "CHARLOTTE", destinationstate: "NC" },
      { shipsource: "USPS", transactiondate: "2026-08-03", trackingnumber: "9400000000000002", weight: "1.5", transactionamount: 8.2, originzip: "89113", destinationcity: "PHOENIX", destinationstate: "AZ" },
    ]);
    const { summary, aggregates } = await parseReport(file, SETTING_DEFAULTS.shippingRates);
    expect(summary.ups).toMatchObject({ packages: 3, used: 2 });
    expect(summary.skipped["UPS package billed to a third party or the receiver (not our prepaid shipping)"]).toBe(1);
    const lv = aggregates.find((a) => a.carrier === "UPS" && a.origin === "LV")!;
    expect(lv).toMatchObject({ service: "GROUND_RES", zone: 8, count: 1 });
    expect(Number(lv.total)).toBeCloseTo(14.52);
    expect(aggregates.find((a) => a.carrier === "UPS" && a.origin === "GV")).toMatchObject({ zone: 4, service: "GROUND_COM" });
    const charlotte = aggregates.find((a) => a.carrier === "USPS" && Number(a.weight) === 0.5)!;
    expect(charlotte).toMatchObject({ zone: 8, zoneSource: "ups-city" });
    const phoenix = aggregates.find((a) => a.carrier === "USPS" && Number(a.weight) === 2)!;
    expect(phoenix).toMatchObject({ zoneSource: "distance", zone: 3 });
    expect(JSON.stringify(aggregates)).not.toContain("A Person");
  });

  it("rejects a file that isn't the cost report", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("x").addRow(["name", "amount"]);
    await expect(parseReport(Buffer.from(await wb.xlsx.writeBuffer()), SETTING_DEFAULTS.shippingRates)).rejects.toThrow("missing column");
  });
});

describe("product quotes", () => {
  it("works out billable weight from package size", () => {
    // 9 × 7 × 2 bubble mailer, 0.3 lb (Salsify 00028-S): UPS 126 in³ ÷ 139 → 1 lb; USPS under 1 cu ft → actual weight
    expect(billable(0.3, { length: 9, width: 7, height: 2 })).toMatchObject({ ups: 1, usps: 0.3, upsTier: 1, uspsTier: 0.5, uspsDim: null });
    // 18 × 14 × 12 box, 6 lb: UPS 3024 ÷ 139 → 22 lb; USPS 3024 ÷ 166 → 19 lb
    expect(billable(6, { length: 18, width: 14, height: 12 })).toMatchObject({ ups: 22, usps: 19, upsDim: 22, uspsDim: 19 });
    expect(upsDimWeight(null)).toBeNull();
    expect(uspsDimWeight({ length: 12, width: 12, height: 12 })).toBeNull();
    expect(billable(2.2, null)).toMatchObject({ ups: 3, usps: 2.2, uspsTier: 3 });
  });
  it("sends the package size to UPS and Endicia", () => {
    const q = { carrier: "UPS" as const, service: "GROUND_COM" as const, origin: "LV", originZip: "89113", destZip: "10001", zone: 8, weight: 0.3, dims: { length: 9, width: 7, height: 2 } };
    expect(buildUpsRateRequest(q, "796305").RateRequest.Shipment.Package).toMatchObject({ PackageWeight: { Weight: "0.3" }, Dimensions: { UnitOfMeasurement: { Code: "IN" }, Length: "9", Width: "7", Height: "2" } });
    const xml = buildEndiciaRateRequest(SETTING_DEFAULTS.shippingRates, "x", { ...q, carrier: "USPS", service: "GROUND_ADVANTAGE" });
    expect(xml).toContain("<WeightOz>4.8</WeightOz>");
    expect(xml).toContain("<MailpieceDimensions><Length>9</Length><Width>7</Width><Height>2</Height></MailpieceDimensions>");
    expect(buildEndiciaRateRequest(SETTING_DEFAULTS.shippingRates, "x", { ...q, carrier: "USPS", service: "GROUND_ADVANTAGE", dims: null })).not.toContain("MailpieceDimensions");
  });
  it("simulated quotes charge dimensional weight", () => {
    const q = { carrier: "UPS" as const, service: "GROUND_COM" as const, origin: "LV", originZip: "89113", destZip: "10001", zone: 5, weight: 6 };
    expect(simulatedQuote({ ...q, dims: { length: 18, width: 14, height: 12 } }).amount).toBe(simulatedQuote({ ...q, weight: 22 }).amount);
  });
  it("reads weight and size from a Salsify product", () => {
    const fields = SETTING_DEFAULTS.shippingRates.salsify.fields;
    const p = mapProduct(
      { "salsify:id": "00028-S", "Item Name": { "en-US": "Tire Inner Liner Scraper" }, "Shipping Weight (Pounds)": "0.30", "Shipping Length (Inches)": "9.00", "Shipping Width (Inches)": "7.00", "Shipping Height (Inches)": "2.00", "Shipping Packaging Type": "Bubble Mailer" },
      fields,
      "00028-S",
    );
    expect(p).toEqual({ partNumber: "00028-S", name: "Tire Inner Liner Scraper", weight: 0.3, length: 9, width: 7, height: 2, packaging: "Bubble Mailer", source: "primary", fromFallback: [] });
    expect(mapProduct({}, fields, "X1")).toMatchObject({ partNumber: "X1", weight: null, length: null, source: null });
  });
  it("falls back to the UPC weight and size as a set", () => {
    const fields = SETTING_DEFAULTS.shippingRates.salsify.fields;
    const upc = { "UPC Weight (Pounds)": "0.25", "UPC Length (Inches)": "6.75", "UPC Width (Inches)": "3.00", "UPC Height (Inches)": "2.00" };
    // shipping weight present but no shipping box: the whole UPC set is used so weight and size match
    expect(mapProduct({ ...upc, "Shipping Weight (Pounds)": "0.30", "Shipping Packaging Type": "Bubble Mailer" }, fields, "A")).toMatchObject({ weight: 0.25, length: 6.75, width: 3, height: 2, source: "fallback", packaging: null });
    // UPC set incomplete too: fill only the gaps
    expect(mapProduct({ "Shipping Weight (Pounds)": "0.30", "UPC Length (Inches)": "6.75", "UPC Width (Inches)": "3.00" }, fields, "B")).toMatchObject({ weight: 0.3, length: 6.75, width: 3, height: null, source: "mixed", fromFallback: ["length", "width"] });
    expect(plainValue(["a", "b"])).toBe("a");
  });
});
