import type { Crossover } from "@/lib/shipping/analysis";
import { weightLabel } from "@/lib/shipping/weights";

export type RateRow = {
  origin: string;
  zone: number;
  weight: number;
  usps: number | null;
  upsCom: number | null;
  upsRes: number | null;
  /** Cheaper carrier for a business address (USPS vs UPS commercial), null when a price is missing. */
  cheaperCom: "USPS" | "UPS" | null;
  /** Cheaper carrier for a home address (USPS vs UPS residential). */
  cheaperRes: "USPS" | "UPS" | null;
};

const cheaper = (usps: number | null, ups: number | null) => (usps == null || ups == null ? null : ups < usps ? "UPS" : "USPS");

/** The rate-by-weight comparison (USPS Ground Advantage vs UPS Ground) for each warehouse and zone. */
export function rateRows(crossovers: Crossover[], filter?: { origin?: string; zone?: number }): RateRow[] {
  const rows: RateRow[] = [];
  for (const com of crossovers) {
    if (com.upsService !== "GROUND_COM") continue;
    if (filter?.origin && com.origin !== filter.origin) continue;
    if (filter?.zone && com.zone !== filter.zone) continue;
    const res = crossovers.find((c) => c.origin === com.origin && c.zone === com.zone && c.upsService === "GROUND_RES");
    com.points.forEach((p, i) => {
      const upsRes = res?.points[i]?.ups ?? null;
      rows.push({ origin: com.origin, zone: com.zone, weight: p.weight, usps: p.usps, upsCom: p.ups, upsRes, cheaperCom: cheaper(p.usps, p.ups), cheaperRes: cheaper(p.usps, upsRes) });
    });
  }
  return rows;
}

export const RATE_CSV_HEADERS = [
  "mode",
  "warehouse",
  "origin_zip",
  "zone",
  "weight",
  "weight_lb",
  "usps_ground_advantage_usd",
  "ups_ground_commercial_usd",
  "ups_ground_residential_usd",
  "cheaper_business_address",
  "cheaper_home_address",
];

export function rateCsvRows(rows: RateRow[], mode: string, origins: { code: string; name: string; zip: string }[]) {
  const o = (code: string) => origins.find((x) => x.code === code);
  const money = (v: number | null) => (v == null ? "" : v.toFixed(2));
  return rows.map((r) => [mode, o(r.origin)?.name ?? r.origin, o(r.origin)?.zip ?? "", r.zone, weightLabel(r.weight), r.weight, money(r.usps), money(r.upsCom), money(r.upsRes), r.cheaperCom ?? "", r.cheaperRes ?? ""]);
}
