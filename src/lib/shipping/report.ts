import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting, type ShippingRatesSettings } from "@/lib/settings";
import { cityPoint, distanceMiles, estimateZone, fitZoneBands, nearestZip, NON_CONTIGUOUS, zipPoint, type ZoneBands } from "@/lib/shipping/geo";
import { upsTier, uspsTier } from "@/lib/shipping/weights";

// Turns the "Ship Cost History" export (UPS invoice lines + USPS labels) into per-package
// costs, then into totals by carrier / service / origin / zone / weight tier.
// Names and addresses are read only to place each package; nothing personal is stored.

const REQUIRED = ["shipsource", "trackingnumber", "zone", "transactionamount", "billedweight", "weight", "destinationcity", "destinationstate", "originzip", "ups_chargeclasscode", "ups_chargedescription"];

/** UPS Ground freight lines. Third-party/collect ones are excluded from the analysis (not our prepaid shipping)
 *  but still teach us each destination city's real zone, used to place USPS labels. */
const UPS_GROUND = /^Ground (Commercial|Residential)( Third Party| Collect)?$/i;

type UpsPkg = { cost: number; weight?: number; zone?: number; service?: "GROUND_COM" | "GROUND_RES"; billedToOthers?: boolean; account: string; originZip: string; city: string; state: string; date?: Date };
type UspsPkg = { cost: number; weight: number; originZip: string; city: string; state: string; date?: Date };

export type ReportSummary = {
  rows: number;
  ups: { packages: number; used: number; cost: number };
  usps: { packages: number; used: number; cost: number };
  skipped: Record<string, number>;
  zoneSources: Record<string, number>;
  /** Our prepaid shipments per carrier / origin / zone. */
  zoneUsage: { carrier: string; origin: string; zone: number; count: number; cost: number }[];
  /** Each origin's zone boundaries learned from its UPS invoices (null = not enough data, textbook bands used). */
  zoneBands: Record<string, ZoneBands | null>;
  /** Per origin and zone, a ZIP in the city we ship to most in that zone (prepaid UPS) — used as the quote destination. */
  suggestedQuoteZips: Record<string, Record<number, string>>;
};

function text(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("result" in v) return text(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
  }
  return String(v).trim();
}
const num = (v: ExcelJS.CellValue) => {
  const n = Number(text(v));
  return Number.isFinite(n) ? n : 0;
};
const date = (v: ExcelJS.CellValue) => {
  if (v instanceof Date) return v;
  const d = new Date(text(v));
  return isNaN(+d) ? undefined : d;
};

export async function processReport(reportId: string, file: Buffer) {
  const settings = await getSetting("shippingRates");
  await prisma.shippingReport.update({ where: { id: reportId }, data: { status: "RUNNING" } });
  try {
    const { summary, aggregates, dateFrom, dateTo } = await parseReport(file, settings, async (rows) => {
      await prisma.shippingReport.update({ where: { id: reportId }, data: { progress: rows } });
    });
    await prisma.$transaction([
      prisma.shippingHistoryAgg.deleteMany({ where: { reportId } }),
      prisma.shippingHistoryAgg.createMany({ data: aggregates.map((a) => ({ ...a, reportId })) }),
      prisma.shippingReport.update({
        where: { id: reportId },
        data: { status: "READY", rowCount: summary.rows, progress: summary.rows, summary: summary as unknown as Prisma.InputJsonValue, dateFrom, dateTo, finishedAt: new Date() },
      }),
    ]);
    return summary;
  } catch (err) {
    await prisma.shippingReport.update({ where: { id: reportId }, data: { status: "FAILED", error: err instanceof Error ? err.message : String(err), finishedAt: new Date() } });
    throw err;
  }
}

export async function parseReport(file: Buffer, settings: ShippingRatesSettings, onProgress?: (rows: number) => Promise<void>) {
  const originByZip = new Map(settings.origins.map((o) => [o.zip.slice(0, 5), o.code]));
  const zipByOrigin = new Map(settings.origins.map((o) => [o.code, o.zip.slice(0, 5)]));
  const ups = new Map<string, UpsPkg>();
  const usps: UspsPkg[] = [];
  const skipped: Record<string, number> = {};
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);
  let rows = 0;
  let col: Record<string, number> | null = null;

  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(file), { sharedStrings: "cache", hyperlinks: "ignore", styles: "ignore", worksheets: "emit", entries: "emit" });
  let sheetDone = false;
  for await (const sheet of reader) {
    if (sheetDone) break;
    for await (const row of sheet) {
      const values = row.values as ExcelJS.CellValue[];
      if (!col) {
        col = {};
        values.forEach((v, i) => {
          const name = text(v).toLowerCase();
          if (name && !(name in col!)) col![name] = i;
        });
        const missing = REQUIRED.filter((k) => !(k in col!));
        if (missing.length) throw new Error(`This doesn't look like the Ship Cost History report: missing column(s) ${missing.join(", ")}.`);
        continue;
      }
      const get = (k: string) => values[col![k]];
      rows++;
      if (onProgress && rows % 5000 === 0) await onProgress(rows);
      const source = text(get("shipsource")).toUpperCase();
      const tracking = text(get("trackingnumber"));
      if (source === "UPS") {
        if (!tracking) {
          skip("UPS line without tracking number");
          continue;
        }
        let p = ups.get(tracking);
        if (!p) {
          p = { cost: 0, account: tracking.startsWith("1Z") ? tracking.slice(2, 8).toUpperCase() : "", originZip: text(get("originzip")).slice(0, 5), city: "", state: "" };
          ups.set(tracking, p);
        }
        p.cost += num(get("transactionamount"));
        if (!p.originZip) p.originZip = text(get("originzip")).slice(0, 5);
        const cls = text(get("ups_chargeclasscode")).toUpperCase();
        const desc = text(get("ups_chargedescription"));
        if (cls === "FRT" && UPS_GROUND.test(desc) && p.weight === undefined) {
          p.weight = num(get("billedweight"));
          p.zone = parseInt(text(get("zone")), 10);
          p.service = /residential/i.test(desc) ? "GROUND_RES" : "GROUND_COM";
          p.billedToOthers = /third party|collect/i.test(desc);
          p.city = text(get("destinationcity"));
          p.state = text(get("destinationstate")).toUpperCase();
          p.date = date(get("transactiondate"));
        }
      } else if (source === "USPS") {
        usps.push({
          cost: num(get("transactionamount")),
          weight: num(get("weight")),
          originZip: text(get("originzip")).slice(0, 5),
          city: text(get("destinationcity")),
          state: text(get("destinationstate")).toUpperCase(),
          date: date(get("transactiondate")),
        });
      } else {
        skip(`Unknown carrier "${source || "blank"}"`);
      }
    }
    sheetDone = true;
  }
  if (!col) throw new Error("The workbook has no rows.");

  type Key = string;
  const agg = new Map<Key, { carrier: string; service: string; origin: string; zone: number; zoneSource: string; weight: number; count: number; total: number; minCost: number; maxCost: number }>();
  const zoneSources: Record<string, number> = {};
  let dateFrom: Date | undefined, dateTo: Date | undefined;
  const add = (carrier: string, service: string, origin: string, zone: number, zoneSource: string, weight: number, cost: number, d?: Date) => {
    const k = [carrier, service, origin, zone, zoneSource, weight].join("|");
    const a = agg.get(k) ?? { carrier, service, origin, zone, zoneSource, weight, count: 0, total: 0, minCost: Infinity, maxCost: -Infinity };
    a.count++;
    a.total += cost;
    a.minCost = Math.min(a.minCost, cost);
    a.maxCost = Math.max(a.maxCost, cost);
    agg.set(k, a);
    zoneSources[`${carrier} ${zoneSource}`] = (zoneSources[`${carrier} ${zoneSource}`] ?? 0) + 1;
    if (d) {
      if (!dateFrom || d < dateFrom) dateFrom = d;
      if (!dateTo || d > dateTo) dateTo = d;
    }
  };

  // UPS packages; also learn each destination city's real zone from each origin.
  const learned = new Map<string, Map<number, number>>();
  const bandSamples: Record<string, { miles: number; zone: number }[]> = {};
  const topCities = new Map<string, number>(); // "origin|zone|CITY|ST" -> prepaid UPS packages
  const cityKey = (origin: string, city: string, state: string) => `${origin}|${city.trim().toUpperCase()}|${state.trim().toUpperCase()}`;
  let upsUsed = 0, upsCost = 0, uspsUsed = 0, uspsCost = 0;
  for (const p of ups.values()) {
    upsCost += p.cost;
    if (!p.service || p.weight === undefined) {
      skip("UPS package not shipped with UPS Ground (collect, air, hundredweight or adjustment only)");
      continue;
    }
    const origin = settings.upsAccounts[p.account] ?? originByZip.get(p.originZip);
    if (!origin) {
      skip("UPS package from an unmapped account/warehouse");
      continue;
    }
    if (!p.zone || p.zone < 2 || p.zone > 8) {
      skip("UPS package outside zones 2–8 (Alaska, Hawaii, territories, international)");
      continue;
    }
    if (p.city && p.state) {
      const k = cityKey(origin, p.city, p.state);
      const m = learned.get(k) ?? new Map<number, number>();
      m.set(p.zone, (m.get(p.zone) ?? 0) + 1);
      learned.set(k, m);
      const loc = cityPoint(p.city, p.state);
      const o = zipPoint(zipByOrigin.get(origin) ?? "");
      if (loc?.precision === "city" && o) (bandSamples[origin] ??= []).push({ miles: distanceMiles(o, loc.point), zone: p.zone });
    }
    if (p.billedToOthers) {
      skip("UPS package billed to a third party or the receiver (not our prepaid shipping)");
      continue;
    }
    if (p.cost <= 0) {
      skip("UPS package with no net cost (fully adjusted/voided)");
      continue;
    }
    add("UPS", p.service, origin, p.zone, "actual", upsTier(p.weight), p.cost, p.date);
    upsUsed++;
    if (p.city && p.state) {
      const k = `${origin}|${p.zone}|${p.city.trim().toUpperCase()}|${p.state}`;
      topCities.set(k, (topCities.get(k) ?? 0) + 1);
    }
  }

  const zoneBands: Record<string, ZoneBands | null> = {};
  for (const o of settings.origins) zoneBands[o.code] = fitZoneBands(bandSamples[o.code] ?? []);
  const suggestedQuoteZips: Record<string, Record<number, string>> = {};
  const bestCity = new Map<string, { count: number; city: string; state: string }>();
  for (const [k, count] of topCities) {
    const [origin, zone, city, state] = k.split("|");
    const key = `${origin}|${zone}`;
    if (!bestCity.has(key) || bestCity.get(key)!.count < count) bestCity.set(key, { count, city, state });
  }
  for (const [key, c] of bestCity) {
    const [origin, zone] = key.split("|");
    const loc = cityPoint(c.city, c.state);
    const zip = loc?.precision === "city" ? nearestZip(loc.point) : null;
    if (zip) (suggestedQuoteZips[origin] ??= {})[Number(zone)] = zip;
  }

  // USPS labels: zone from UPS history to the same city when known, else estimated by distance.
  for (const p of usps) {
    uspsCost += p.cost;
    const origin = originByZip.get(p.originZip);
    if (!origin) {
      skip("USPS label from an unknown origin ZIP");
      continue;
    }
    if (NON_CONTIGUOUS.has(p.state)) {
      skip("USPS label outside zones 2–8 (Alaska, Hawaii, territories, military)");
      continue;
    }
    if (p.cost <= 0 || p.weight <= 0) {
      skip("USPS label with no cost or weight (refunded/voided)");
      continue;
    }
    let zone: number | undefined;
    let source = "";
    const seen = learned.get(cityKey(origin, p.city, p.state));
    if (seen) {
      zone = [...seen.entries()].sort((a, b) => b[1] - a[1])[0][0];
      source = "ups-city";
    } else {
      const est = estimateZone(zipByOrigin.get(origin)!, p.city, p.state, zoneBands[origin] ?? undefined);
      if (est) {
        zone = est.zone;
        source = est.precision === "city" ? "distance" : "distance-state";
      }
    }
    if (!zone) {
      skip("USPS label whose destination couldn't be located");
      continue;
    }
    add("USPS", "GROUND_ADVANTAGE", origin, zone, source, uspsTier(p.weight), p.cost, p.date);
    uspsUsed++;
  }

  const aggregates = [...agg.values()].map((a) => ({
    ...a,
    weight: new Prisma.Decimal(a.weight),
    total: new Prisma.Decimal(a.total.toFixed(2)),
    minCost: new Prisma.Decimal(a.minCost.toFixed(2)),
    maxCost: new Prisma.Decimal(a.maxCost.toFixed(2)),
  }));
  const usage = new Map<string, { carrier: string; origin: string; zone: number; count: number; cost: number }>();
  for (const a of agg.values()) {
    const k = `${a.carrier}|${a.origin}|${a.zone}`;
    const u = usage.get(k) ?? { carrier: a.carrier, origin: a.origin, zone: a.zone, count: 0, cost: 0 };
    u.count += a.count;
    u.cost = Math.round((u.cost + a.total) * 100) / 100;
    usage.set(k, u);
  }
  const summary: ReportSummary = {
    rows,
    ups: { packages: ups.size, used: upsUsed, cost: Math.round(upsCost * 100) / 100 },
    usps: { packages: usps.length, used: uspsUsed, cost: Math.round(uspsCost * 100) / 100 },
    skipped,
    zoneSources,
    zoneBands,
    suggestedQuoteZips,
    zoneUsage: [...usage.values()].sort((a, b) => a.carrier.localeCompare(b.carrier) || a.origin.localeCompare(b.origin) || a.zone - b.zone),
  };
  return { summary, aggregates, dateFrom, dateTo };
}
