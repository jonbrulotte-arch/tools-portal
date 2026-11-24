import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting, type ShippingRatesSettings } from "@/lib/settings";
import { cityPoint, distanceMiles, estimateZone, fitZoneBands, nearestZip, NON_CONTIGUOUS, zipPoint, type ZoneBands } from "@/lib/shipping/geo";
import { upsTier, uspsTier } from "@/lib/shipping/weights";
import { bandIndex, WEIGHT_BANDS } from "@/lib/shipping/blended-cost";

// Turns the "Ship Cost History" export (UPS invoice lines + USPS labels) into per-package
// costs, then into totals by carrier / service / origin / zone / weight tier.
// Names and addresses are read only to place each package; nothing personal is stored.

const REQUIRED = ["shipsource", "trackingnumber", "zone", "transactionamount", "billedweight", "weight", "destinationcity", "destinationstate", "originzip", "ups_chargeclasscode", "ups_chargedescription"];

/** UPS Ground freight lines. Third-party/collect ones are excluded from the analysis (not our prepaid shipping)
 *  but still teach us each destination city's real zone, used to place USPS labels. */
const UPS_GROUND = /^Ground (Commercial|Residential)( Third Party| Collect)?$/i;

/** UPS charges on our prepaid Ground packages, split the way quotes are compared with them. */
export type UpsChargeTotals = { packages: number; freight: number; fuel: number; residential: number; weightHandling: number; other: number };
/** A warehouse's UPS charges, overall and per reality-check weight band (index into WEIGHT_BANDS). */
export type UpsCharges = UpsChargeTotals & { bands?: UpsChargeTotals[] };
type ChargeKind = "freight" | "fuel" | "residential" | "weightHandling" | "other";
const CHARGE_KINDS: ChargeKind[] = ["freight", "fuel", "residential", "weightHandling", "other"];
/** "handling": any other additional-handling line (size, its demand surcharge, corrections), placed per package. */
type LineKind = ChargeKind | "handling";

/** Over this billed weight a UPS quote already includes additional handling (UPS charges one per package). */
export const QUOTED_HANDLING_OVER_LB = 50;

/** Which bucket a UPS invoice line goes in. The Ground freight line itself is "freight". */
export function upsChargeKind(cls: string, desc: string): LineKind {
  if (cls.toUpperCase() === "FRT" && UPS_GROUND.test(desc)) return "freight";
  if (/fuel/i.test(desc) && !/address/i.test(desc)) return "fuel";
  if (/^residential/i.test(desc)) return "residential";
  // over 50 lb UPS adds handling by weight alone, so a quote at that weight already includes it
  if (/handling/i.test(desc) && /weight/i.test(desc) && !/correction|demand/i.test(desc)) return "weightHandling";
  if (/handling/i.test(desc)) return "handling";
  return "other";
}

/**
 * A package's charges in the buckets that are kept. Over 50 lb billed, every additional-handling line (by size,
 * its demand surcharge, corrections) counts as handling by weight: UPS charges one additional handling per
 * package, and the quote at that weight already has it. Lighter packages' handling is a surcharge ("other").
 */
export function packageCharges(lines: Record<LineKind, number>, billedLb: number): Record<ChargeKind, number> {
  const heavy = billedLb > QUOTED_HANDLING_OVER_LB;
  return {
    freight: lines.freight,
    fuel: lines.fuel,
    residential: lines.residential,
    weightHandling: lines.weightHandling + (heavy ? lines.handling : 0),
    other: lines.other + (heavy ? 0 : lines.handling),
  };
}

/** A package's order references from the cost report (optional columns; no names or street addresses). */
export type OrderRefs = { po: string | null; so: string | null; marketplace: string | null; channel: string | null; reference: string | null; shipRef: string | null; destCompany: string | null };
const REF_COLUMNS: Record<keyof OrderRefs, string> = { po: "customer_po", so: "so_number", marketplace: "marketplace", channel: "ups_pkgref5", reference: "reference1", shipRef: "ups_shiprefnum1", destCompany: "destinationcompanyname" };
const noRefs = (): OrderRefs => ({ po: null, so: null, marketplace: null, channel: null, reference: null, shipRef: null, destCompany: null });

/** A package counted in a report's totals, for the Carrier choice report. */
export type PackageRow = OrderRefs & { tracking: string; carrier: "UPS" | "USPS"; service: string; origin: string; zone: number; actualWeight: number | null; billedWeight: number; cost: number; shippedAt: Date | null; destState: string | null };

type UpsPkg = { refs: OrderRefs; actual?: number; cost: number; charges: Record<LineKind, number>; weight?: number; zone?: number; service?: "GROUND_COM" | "GROUND_RES"; billedToOthers?: boolean; account: string; originZip: string; city: string; state: string; date?: Date };
type UspsPkg = { refs: OrderRefs; tracking: string; cost: number; weight: number; originZip: string; city: string; state: string; date?: Date };

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
  /** Each warehouse's UPS charges on the packages used (prepaid Ground, zones 2–8); missing on older reports. */
  upsCharges?: Record<string, UpsCharges>;
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
const round2 = (n: number) => Math.round(n * 100) / 100;
const noCharges = (): UpsChargeTotals => ({ packages: 0, freight: 0, fuel: 0, residential: 0, weightHandling: 0, other: 0 });
const roundCharges = (c: UpsChargeTotals): UpsChargeTotals => ({ packages: c.packages, freight: round2(c.freight), fuel: round2(c.fuel), residential: round2(c.residential), weightHandling: round2(c.weightHandling), other: round2(c.other) });
const date = (v: ExcelJS.CellValue) => {
  if (v instanceof Date) return v;
  const d = new Date(text(v));
  return isNaN(+d) ? undefined : d;
};

export async function processReport(reportId: string, file: Buffer) {
  const settings = await getSetting("shippingRates");
  await prisma.shippingReport.update({ where: { id: reportId }, data: { status: "RUNNING" } });
  try {
    const { summary, aggregates, dateFrom, dateTo, shipmentOrigins, packages } = await parseReport(file, settings, async (rows) => {
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
    await savePackages(reportId, packages);
    await saveShipmentOrigins(shipmentOrigins).catch((err) => console.error("[shipping] couldn't save shipment origins", err));
    return summary;
  } catch (err) {
    await prisma.shippingReport.update({ where: { id: reportId }, data: { status: "FAILED", error: err instanceof Error ? err.message : String(err), finishedAt: new Date() } });
    throw err;
  }
}

/** Replaces a report's package rows (for the Carrier choice report). */
async function savePackages(reportId: string, packages: PackageRow[]) {
  await prisma.shippingPackage.deleteMany({ where: { reportId } });
  for (let i = 0; i < packages.length; i += 5000) await prisma.shippingPackage.createMany({ data: packages.slice(i, i + 5000).map((p) => ({ ...p, reportId })) });
}

const ORIGIN_RETENTION_DAYS = 120;

/** Remembers which warehouse shipped each package (new tracking numbers only) and forgets old ones. */
export async function saveShipmentOrigins(rows: { tracking: string; origin: string; carrier: string; shippedAt: Date | null }[]) {
  for (let i = 0; i < rows.length; i += 5000) await prisma.shipmentOrigin.createMany({ data: rows.slice(i, i + 5000), skipDuplicates: true });
  await prisma.shipmentOrigin.deleteMany({ where: { OR: [{ shippedAt: { lt: new Date(Date.now() - ORIGIN_RETENTION_DAYS * 86_400_000) } }, { shippedAt: null, createdAt: { lt: new Date(Date.now() - ORIGIN_RETENTION_DAYS * 86_400_000) } }] } });
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
      /** Fills the order references still empty from this line (the first line with a value wins). */
      const fillRefs = (refs: OrderRefs) => {
        for (const [k, c] of Object.entries(REF_COLUMNS) as [keyof OrderRefs, string][]) if (!refs[k] && c in col!) refs[k] = text(get(c)).slice(0, 120) || null;
        // the company column holds the recipient's own name on many labels: never keep a person's name
        if (refs.destCompany && "destinationname" in col! && refs.destCompany.toLowerCase() === text(get("destinationname")).toLowerCase()) refs.destCompany = null;
      };
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
          p = { refs: noRefs(), cost: 0, charges: { freight: 0, fuel: 0, residential: 0, weightHandling: 0, handling: 0, other: 0 }, account: tracking.startsWith("1Z") ? tracking.slice(2, 8).toUpperCase() : "", originZip: text(get("originzip")).slice(0, 5), city: "", state: "" };
          ups.set(tracking, p);
        }
        const amount = num(get("transactionamount"));
        p.cost += amount;
        if (!p.originZip) p.originZip = text(get("originzip")).slice(0, 5);
        const cls = text(get("ups_chargeclasscode")).toUpperCase();
        const desc = text(get("ups_chargedescription"));
        p.charges[upsChargeKind(cls, desc)] += amount;
        fillRefs(p.refs);
        if (cls === "FRT" && UPS_GROUND.test(desc) && p.weight === undefined) {
          p.weight = num(get("billedweight"));
          p.actual = num(get("weight")) || undefined;
          p.zone = parseInt(text(get("zone")), 10);
          p.service = /residential/i.test(desc) ? "GROUND_RES" : "GROUND_COM";
          p.billedToOthers = /third party|collect/i.test(desc);
          p.city = text(get("destinationcity"));
          p.state = text(get("destinationstate")).toUpperCase();
          p.date = date(get("transactiondate"));
        }
      } else if (source === "USPS") {
        const refs = noRefs();
        fillRefs(refs);
        usps.push({
          refs,
          tracking,
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
  const packages: PackageRow[] = [];
  const upsCharges: Record<string, UpsCharges> = {};
  for (const [tracking, p] of ups) {
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
    // home deliveries: the "company" is the person's name, so it's only kept for business (commercial) addresses
    packages.push({ ...p.refs, destCompany: p.service === "GROUND_COM" ? p.refs.destCompany : null, tracking, carrier: "UPS", service: p.service, origin, zone: p.zone, actualWeight: p.actual ?? null, billedWeight: upsTier(p.weight), cost: Math.round(p.cost * 100) / 100, shippedAt: p.date ?? null, destState: p.state || null });
    const c = (upsCharges[origin] ??= { ...noCharges(), bands: WEIGHT_BANDS.map(noCharges) });
    const band = c.bands![bandIndex(upsTier(p.weight))];
    const charges = packageCharges(p.charges, p.weight);
    for (const t of [c, band]) {
      t.packages++;
      for (const k of CHARGE_KINDS) t[k] += charges[k];
    }
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
    // USPS labels don't say home or business, and their company column is usually the person: never kept
    packages.push({ ...p.refs, destCompany: null, tracking: p.tracking.replace(/\s/g, ""), carrier: "USPS", service: "GROUND_ADVANTAGE", origin, zone, actualWeight: p.weight, billedWeight: uspsTier(p.weight), cost: Math.round(p.cost * 100) / 100, shippedAt: p.date ?? null, destState: p.state || null });
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
    upsCharges: Object.fromEntries(Object.entries(upsCharges).map(([o, c]) => [o, { ...roundCharges(c), bands: c.bands!.map(roundCharges) }])),
    zoneUsage: [...usage.values()].sort((a, b) => a.carrier.localeCompare(b.carrier) || a.origin.localeCompare(b.origin) || a.zone - b.zone),
  };
  // which warehouse shipped each package (tracking number → warehouse), for placing a product's shipments
  const shipmentOrigins: { tracking: string; origin: string; carrier: string; shippedAt: Date | null }[] = [];
  for (const [tracking, p] of ups) {
    const origin = settings.upsAccounts[p.account] ?? originByZip.get(p.originZip);
    if (origin) shipmentOrigins.push({ tracking, origin, carrier: "UPS", shippedAt: p.date ?? null });
  }
  for (const p of usps) {
    const origin = originByZip.get(p.originZip);
    if (p.tracking && origin && p.cost > 0) shipmentOrigins.push({ tracking: p.tracking.replace(/\s/g, ""), origin, carrier: "USPS", shippedAt: p.date ?? null });
  }
  return { summary, aggregates, dateFrom, dateTo, shipmentOrigins, packages };
}
