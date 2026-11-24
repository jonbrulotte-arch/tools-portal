import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { loadHistory, loadQuotes } from "@/lib/shipping/analysis";
import { loadMix, realityCheck, WEIGHT_BANDS } from "@/lib/shipping/blended-cost";
import { channelOf, filterChoices, priceChoices, summarizeChoices, type ChoiceFilter, type ChoiceRow } from "@/lib/shipping/carrier-choice";

// Server-side reads for the Carrier choice report (page and Excel export).

/** The filter from the page's query string. */
export function choiceFilterFrom(sp: Record<string, string | undefined>): ChoiceFilter {
  const band = sp.band === undefined || sp.band === "" ? undefined : Number(sp.band);
  const maxLb = sp.maxLb ? Number(sp.maxLb) : undefined;
  return {
    origin: sp.origin || undefined,
    carrier: sp.carrier === "UPS" || sp.carrier === "USPS" ? sp.carrier : undefined,
    band: band != null && Number.isInteger(band) && band >= 0 && band < WEIGHT_BANDS.length ? band : undefined,
    channel: sp.channel || undefined,
    noOrderLink: sp.link === "none",
    maxLb: maxLb != null && maxLb > 0 ? maxLb : undefined,
    q: sp.q?.slice(0, 100) || undefined,
    all: sp.show === "all",
  };
}

/** Every package of the newest processed cost report, priced on both carriers, or why it can't be. */
export async function loadCarrierChoice() {
  const [mix, report, run, s] = await Promise.all([
    loadMix(),
    prisma.shippingReport.findFirst({ where: { status: "READY" }, orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, dateFrom: true, dateTo: true, _count: { select: { packages: true } } } }),
    prisma.shippingQuoteRun.findFirst({ where: { status: "READY" }, orderBy: [{ mode: "asc" }, { createdAt: "desc" }], select: { id: true, mode: true, createdAt: true } }),
    getSetting("shippingRates"),
  ]);
  const origins = s.origins.map((o) => ({ code: o.code, name: o.name }));
  const base = {
    origins,
    report: report ? { fileName: report.fileName, dateFrom: report.dateFrom?.toISOString() ?? null, dateTo: report.dateTo?.toISOString() ?? null } : null,
    run: run ? { mode: run.mode, at: run.createdAt.toISOString() } : null,
  };
  if (!mix || !report || !run) return { ...base, problem: "no-data" as const, rows: [] as ChoiceRow[], modelTotal: null };
  if (!report._count.packages) return { ...base, problem: "no-packages" as const, rows: [] as ChoiceRow[], modelTotal: null };
  const [packages, quotes, history] = await Promise.all([prisma.shippingPackage.findMany({ where: { reportId: report.id } }), loadQuotes(run.id), loadHistory(report.id)]);
  const chart = quotes.map((q) => ({ service: q.service, origin: q.origin, zone: q.zone, weight: q.weight, amount: q.amount }));
  const rows = priceChoices(
    packages.map((p) => ({ ...p, carrier: p.carrier === "USPS" ? ("USPS" as const) : ("UPS" as const), shippedAt: p.shippedAt?.toISOString() ?? null })),
    chart,
    mix,
  );
  const modelTotal = realityCheck(history.map((h) => ({ ...h, total: h.avg * h.count })), chart, mix).carrierChoice;
  return { ...base, problem: null, rows, modelTotal };
}

export const TABLE_LIMIT = 500;

/** The page's view: the filtered packages' totals and splits, and the first TABLE_LIMIT packages by extra cost. */
export async function carrierChoiceView(filter: ChoiceFilter) {
  const data = await loadCarrierChoice();
  const name = new Map(data.origins.map((o) => [o.code, o.name]));
  const shown = filterChoices(data.rows, filter).sort((a, b) => (b.extra ?? -1) - (a.extra ?? -1) || b.cost - a.cost);
  const overall = summarizeChoices(filterChoices(data.rows, {}));
  return {
    origins: data.origins,
    report: data.report,
    run: data.run,
    problem: data.problem,
    modelTotal: data.modelTotal,
    /** All packages that went on the dearer carrier, before the filter. */
    overall: overall.totals,
    summary: summarizeChoices(shown, (c) => name.get(c) ?? c),
    bands: WEIGHT_BANDS.map((b) => b.label),
    channels: [...new Set(data.rows.map(channelOf))].sort(),
    rows: shown.slice(0, TABLE_LIMIT),
    total: shown.length,
  };
}
export type CarrierChoiceView = Awaited<ReturnType<typeof carrierChoiceView>>;

const MONEY = '"$"#,##0.00';

/** The filtered packages as a workbook: Summary, Packages, By channel, Notes. */
export async function carrierChoiceWorkbook(filter: ChoiceFilter): Promise<{ buf: Buffer; fileName: string } | null> {
  const data = await loadCarrierChoice();
  if (data.problem) return null;
  const name = new Map(data.origins.map((o) => [o.code, o.name]));
  const rows = filterChoices(data.rows, filter).sort((a, b) => (b.extra ?? -1) - (a.extra ?? -1) || b.cost - a.cost);
  const sum = summarizeChoices(rows, (c) => name.get(c) ?? c);
  const period = `${data.report?.dateFrom?.slice(0, 10) ?? "?"} to ${data.report?.dateTo?.slice(0, 10) ?? "?"}`;

  const wb = new ExcelJS.Workbook();
  const font = { name: "Arial", size: 10 };
  const sheet = (title: string, headers: string[], widths: number[]) => {
    const ws = wb.addWorksheet(title);
    ws.columns = headers.map((h, i) => ({ header: h, width: widths[i] ?? 14 }));
    ws.getRow(1).font = { ...font, bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    return ws;
  };

  const s = wb.addWorksheet("Summary");
  s.columns = [{ width: 46 }, { width: 16 }, { width: 70 }];
  const filters = [
    filter.carrier && `carrier ${filter.carrier}`,
    filter.origin && `warehouse ${name.get(filter.origin) ?? filter.origin}`,
    filter.band != null && WEIGHT_BANDS[filter.band]?.label,
    filter.maxLb && `billed at ${filter.maxLb} lb or less`,
    filter.channel && `channel ${filter.channel}`,
    filter.noOrderLink && "no order link",
    filter.q && `matching "${filter.q}"`,
    filter.all ? "every package" : "only packages on the dearer carrier",
  ].filter(Boolean);
  s.addRows([
    ["Carrier choice report"],
    [`Cost report ${period}; quotes from the ${data.run?.mode ?? ""} run of ${data.run?.at.slice(0, 10) ?? "?"}. Filter: ${filters.join(", ")}.`],
    [],
    ["Packages", sum.totals.packages],
    ["Paid for them", sum.totals.paid],
    ["On the dearer carrier", sum.totals.dearer],
    ["Extra cost on the dearer carrier (quotes)", sum.totals.extra, "Quote on the carrier used − quote on the other carrier, added up. See Notes."],
    ["Without a quote on both carriers", sum.totals.unpriced],
    [],
    ["The reality check's carrier choice figure (all packages)", data.modelTotal ?? "", "Worked out from weight-band and zone averages, so it won't match this report's total exactly."],
  ]);
  s.getRow(1).font = { ...font, bold: true, size: 12 };
  for (const r of [5, 7, 10]) s.getCell(`B${r}`).numFmt = MONEY;
  s.eachRow((row) => row.eachCell((c) => (c.font = { ...font, ...(c.font ?? {}), name: "Arial" })));

  const p = sheet(
    "Packages",
    ["Tracking number", "Ship date", "Warehouse", "Carrier", "Service", "Zone", "Actual lb", "Billed lb", "Paid ($)", "UPS quote ($)", "USPS quote ($)", "Cheaper carrier", "Extra on the carrier used ($)", "Customer PO", "SO", "Marketplace", "Channel (UPS ref 5)", "Reference 1", "Ship ref 1", "Destination company", "State", "No order link"],
    [22, 11, 12, 8, 12, 6, 9, 9, 10, 12, 12, 10, 14, 18, 14, 16, 18, 20, 16, 30, 6, 10],
  );
  const service = (s: string) => (s === "GROUND_RES" ? "Residential" : s === "GROUND_COM" ? "Commercial" : "Ground Advantage");
  for (const r of rows) {
    p.addRow([r.tracking, r.shippedAt ? new Date(r.shippedAt) : null, name.get(r.origin) ?? r.origin, r.carrier, service(r.service), r.zone, r.actualWeight, r.billedWeight, r.cost, r.upsQuote, r.uspsQuote, r.cheaper ?? "", r.extra, r.po, r.so, r.marketplace, r.channel, r.reference, r.shipRef, r.destCompany, r.destState, r.noOrderLink ? "Yes" : ""]);
  }
  p.getColumn(2).numFmt = "yyyy-mm-dd";
  for (const c of [9, 10, 11, 13]) p.getColumn(c).numFmt = MONEY;

  const g = sheet("By channel", ["Channel or marketplace", "Packages", "On the dearer carrier", "Paid ($)", "Extra ($)"], [28, 10, 14, 14, 14]);
  for (const c of sum.byChannel) g.addRow([c.label, c.packages, c.dearer, c.paid, c.extra]);
  for (const c of [4, 5]) g.getColumn(c).numFmt = MONEY;

  const n = wb.addWorksheet("Notes");
  n.getColumn(1).width = 120;
  n.addRows(
    [
      "How this report is worked out",
      "One row per prepaid package counted in the cost report (UPS Ground and USPS Ground Advantage we paid for, zones 2–8).",
      "UPS quote: the quote for the package's warehouse, zone and weight, raised by that warehouse's UPS surcharge ratio for the weight band (as on the Products page). A UPS package uses its own service (residential or commercial) and the weight UPS billed; a USPS package uses the warehouse's residential/commercial blend at its actual weight.",
      "USPS quote: Ground Advantage for the warehouse and zone at the package's actual weight tier (4/8/12/15.99 oz, then whole pounds). USPS zones on labels may be estimated from the city.",
      "Extra on the carrier used = the quote on the carrier used − the quote on the other carrier, when that's more. It compares quotes, not what was paid, so both carriers are priced the same way.",
      "Not every package could have gone the other way: retailer routing guides may require UPS, and large boxes are billed by size at USPS above one cubic foot (not modelled here). Use the list to find patterns worth a closer look.",
      "The reality check's figure works from weight-band and zone averages; this report prices each package at its own zone and weight, so the totals differ somewhat.",
      "No order link: neither a customer PO nor a marketplace order is on the package in the cost report (often manual, replacement or return labels).",
    ].map((t) => [t]),
  );
  n.getRow(1).font = { ...font, bold: true };
  n.getColumn(1).alignment = { wrapText: true, vertical: "top" };

  const fileName = `carrier-choice-${data.report?.dateFrom?.slice(0, 10) ?? "report"}-to-${data.report?.dateTo?.slice(0, 10) ?? ""}.xlsx`;
  return { buf: Buffer.from(await wb.xlsx.writeBuffer()), fileName };
}
