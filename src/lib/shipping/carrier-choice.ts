import { bandIndex, WEIGHT_BANDS, type MixData } from "@/lib/shipping/blended-cost";
import { upsTier, uspsTier } from "@/lib/shipping/weights";

// The Carrier choice report: each prepaid package from the newest cost report, priced from the quote chart on the
// carrier it went with and on the other carrier, so the shipping team can see which orders (PO, SO, channel) went on
// the dearer carrier, and by how much. The reality check's "carrier choice" figure is the same idea worked out from
// the weight-band and zone averages; this report prices each package at its own zone and weight.

export type ChoicePackage = {
  tracking: string;
  carrier: "UPS" | "USPS";
  service: string;
  origin: string;
  zone: number;
  actualWeight: number | null;
  billedWeight: number;
  cost: number;
  shippedAt: string | null;
  po: string | null;
  so: string | null;
  marketplace: string | null;
  channel: string | null;
  reference: string | null;
  shipRef: string | null;
  destCompany: string | null;
  destState: string | null;
};

export type ChoiceRow = ChoicePackage & {
  /** Weight band (index into WEIGHT_BANDS) of the package's actual weight, else its billed weight. */
  band: number;
  /** Quotes (with the UPS surcharge ratio) on each carrier; null when the chart has no price there. */
  upsQuote: number | null;
  uspsQuote: number | null;
  /** The carrier with the lower quote, when both are known. */
  cheaper: "UPS" | "USPS" | null;
  /** The quote on the carrier used minus the other carrier's, when that's more (else 0; null without both quotes). */
  extra: number | null;
  /** No marketplace order or customer PO in the cost report. */
  noOrderLink: boolean;
};

type ChartCell = { service: string; origin: string; zone: number; weight: number; amount: number | null };

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Pure: prices every package on both carriers from the quote chart. */
export function priceChoices(packages: ChoicePackage[], chart: ChartCell[], mix: Pick<MixData, "resShare" | "upsUplift" | "upsUpliftByBand">): ChoiceRow[] {
  const at = new Map(chart.map((c) => [`${c.service}|${c.origin}|${c.zone}|${c.weight}`, c.amount]));
  const price = (service: string, origin: string, zone: number, lb: number) => at.get(`${service}|${origin}|${zone}|${lb}`) ?? null;
  const uplift = (origin: string, lb: number) => 1 + (mix.upsUpliftByBand[origin]?.[bandIndex(lb)] ?? mix.upsUplift[origin] ?? 0);

  return packages.map((p) => {
    const lb = p.actualWeight ?? p.billedWeight;
    let upsQuote: number | null;
    if (p.carrier === "UPS") {
      // the service it went with (home or business), at the weight UPS billed
      const q = price(p.service, p.origin, p.zone, p.billedWeight);
      upsQuote = q == null ? null : q * uplift(p.origin, p.billedWeight);
    } else {
      // UPS wasn't used, so home or business isn't known: blend them by the warehouse's residential share
      const w = upsTier(lb);
      const res = price("GROUND_RES", p.origin, p.zone, w), com = price("GROUND_COM", p.origin, p.zone, w);
      const s = mix.resShare[p.origin] ?? 0.5;
      const blend = res != null && com != null ? s * res + (1 - s) * com : (res ?? com);
      upsQuote = blend == null ? null : blend * uplift(p.origin, w);
    }
    const uspsQuote = price("GROUND_ADVANTAGE", p.origin, p.zone, p.carrier === "USPS" ? p.billedWeight : uspsTier(lb));
    const both = upsQuote != null && uspsQuote != null;
    const used = p.carrier === "UPS" ? upsQuote : uspsQuote, other = p.carrier === "UPS" ? uspsQuote : upsQuote;
    return {
      ...p,
      band: bandIndex(lb),
      upsQuote: upsQuote == null ? null : round2(upsQuote),
      uspsQuote: uspsQuote == null ? null : round2(uspsQuote),
      cheaper: both ? (uspsQuote! < upsQuote! ? "USPS" : upsQuote! < uspsQuote! ? "UPS" : null) : null,
      extra: both ? round2(Math.max(0, used! - other!)) : null,
      noOrderLink: !p.po && !p.marketplace,
    };
  });
}

export type ChoiceFilter = {
  origin?: string;
  carrier?: "UPS" | "USPS";
  band?: number;
  /** Channel (UPS reference 5) or marketplace, exactly. */
  channel?: string;
  noOrderLink?: boolean;
  /** Only packages at or under this billed weight (lb). */
  maxLb?: number;
  /** Search in PO, SO, tracking, references and company. */
  q?: string;
  /** Every package, not only those that went on the dearer carrier. */
  all?: boolean;
};

export const channelOf = (r: Pick<ChoiceRow, "channel" | "marketplace">) => r.channel || r.marketplace || "(none)";

export function filterChoices(rows: ChoiceRow[], f: ChoiceFilter): ChoiceRow[] {
  const q = f.q?.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (f.all || (r.extra ?? 0) > 0) &&
      (!f.origin || r.origin === f.origin) &&
      (!f.carrier || r.carrier === f.carrier) &&
      (f.band == null || r.band === f.band) &&
      (!f.channel || channelOf(r) === f.channel) &&
      (!f.noOrderLink || r.noOrderLink) &&
      (f.maxLb == null || r.billedWeight <= f.maxLb) &&
      (!q || [r.po, r.so, r.tracking, r.reference, r.shipRef, r.destCompany, r.marketplace, r.channel].some((v) => v?.toLowerCase().includes(q))),
  );
}

export type ChoiceTotals = { packages: number; paid: number; extra: number; dearer: number; unpriced: number };
export type ChoiceGroup = ChoiceTotals & { key: string; label: string };

function totals(rows: ChoiceRow[]): ChoiceTotals {
  let paid = 0, extra = 0, dearer = 0, unpriced = 0;
  for (const r of rows) {
    paid += r.cost;
    if (r.extra == null) unpriced++;
    else if (r.extra > 0) {
      extra += r.extra;
      dearer++;
    }
  }
  return { packages: rows.length, paid: round2(paid), extra: round2(extra), dearer, unpriced };
}

function groupBy(rows: ChoiceRow[], key: (r: ChoiceRow) => string, label: (k: string) => string = (k) => k): ChoiceGroup[] {
  const m = new Map<string, ChoiceRow[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k) ?? [];
    list.push(r);
    m.set(k, list);
  }
  return [...m.entries()].map(([k, list]) => ({ key: k, label: label(k), ...totals(list) })).sort((a, b) => b.extra - a.extra || b.packages - a.packages);
}

/** Totals for the filtered packages, and the same split by carrier, warehouse, weight band and channel. */
export function summarizeChoices(rows: ChoiceRow[], originName: (code: string) => string = (c) => c) {
  return {
    totals: totals(rows),
    byCarrier: groupBy(rows, (r) => r.carrier),
    byOrigin: groupBy(rows, (r) => r.origin, originName),
    byBand: groupBy(rows, (r) => String(r.band), (k) => WEIGHT_BANDS[Number(k)]?.label ?? k).sort((a, b) => Number(a.key) - Number(b.key)),
    byChannel: groupBy(rows, channelOf),
  };
}
export type ChoiceSummary = ReturnType<typeof summarizeChoices>;
