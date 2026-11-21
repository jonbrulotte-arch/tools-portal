import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ShippingRatesSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { upsAccountFor } from "@/lib/shipping/carriers";
import {
  API_SOURCES,
  usageDay,
  type ApiSource,
} from "@/lib/shipping/api-usage";

// API Report tab: carrier API requests per account, with the average daily volume of rate requests.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const apiReportQuerySchema = z
  .object({
    from: z.string().regex(DAY, "Use YYYY-MM-DD").optional(),
    to: z.string().regex(DAY, "Use YYYY-MM-DD").optional(),
    days: z.coerce.number().int().min(1).max(366).optional(),
    format: z.enum(["json", "csv"]).optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: "'From' must be on or before 'To'",
  });
export type ApiReportQuery = z.infer<typeof apiReportQuerySchema>;

/** YYYY-MM-DD ± n days (calendar arithmetic, no time zone involved). */
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1))
    out.push(d);
  return out;
}

/** The period asked for: explicit from/to, or the last N days (default 30) ending today, in Pacific days. */
export function resolvePeriod(
  q: Pick<ApiReportQuery, "from" | "to" | "days">,
  today = usageDay(),
) {
  const to = q.to ?? today;
  const from = q.from ?? addDays(to, -((q.days ?? 30) - 1));
  return { from, to, days: daysBetween(from, to) };
}

export type UsageRow = {
  day: string;
  carrier: string;
  account: string;
  source: string;
  kind: string;
  outcome: string;
  count: number;
};
type AccountMeta = {
  carrier: "UPS" | "USPS";
  account: string;
  warehouse: string | null;
  quoting: boolean;
};

const zeroSources = () =>
  Object.fromEntries(API_SOURCES.map((s) => [s, 0])) as Record<
    ApiSource,
    number
  >;

function figures(rows: UsageRow[], days: string[]) {
  const rate = rows.filter((r) => r.kind === "rate");
  const perDay = new Map<string, number>();
  for (const r of rate) perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.count);
  const requests = rate.reduce((n, r) => n + r.count, 0);
  const activeDays = [...perDay.values()].filter((n) => n > 0).length;
  let peak: { day: string; count: number } | null = null;
  for (const [day, count] of perDay)
    if (
      count > 0 &&
      (!peak || count > peak.count || (count === peak.count && day > peak.day))
    )
      peak = { day, count };
  const bySource = zeroSources();
  for (const r of rate)
    if (r.source in bySource) bySource[r.source as ApiSource] += r.count;
  const sum = (f: (r: UsageRow) => boolean) =>
    rate.filter(f).reduce((n, r) => n + r.count, 0);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    requests,
    avgDaily: days.length ? round2(requests / days.length) : 0,
    avgActiveDay: activeDays ? round2(requests / activeDays) : 0,
    activeDays,
    peak,
    errors: sum((r) => r.outcome === "error"),
    throttled: sum((r) => r.outcome === "throttled"),
    tokens: rows
      .filter((r) => r.kind === "token")
      .reduce((n, r) => n + r.count, 0),
    estimated: sum((r) => r.source === "estimate"),
    bySource,
  };
}

const keyOf = (carrier: string, account: string) => `${carrier}:${account}`;

/** The configured accounts: every UPS account (with its warehouse and whether it quotes) and the Endicia account. */
export function accountsFrom(s: ShippingRatesSettings): AccountMeta[] {
  const name = (code: string) =>
    s.origins.find((o) => o.code === code)?.name ?? code;
  const quoting = new Set(
    s.origins.map((o) => upsAccountFor(s, o.code)).filter(Boolean),
  );
  const ups = Object.entries(s.upsAccounts).map(([account, origin]) => ({
    carrier: "UPS" as const,
    account,
    warehouse: name(origin),
    quoting: quoting.has(account),
  }));
  const usps = s.endicia.accountId
    ? [
        {
          carrier: "USPS" as const,
          account: s.endicia.accountId,
          warehouse: null,
          quoting: true,
        },
      ]
    : [];
  return [...ups, ...usps];
}

/** Pure report maths over stored rows (tests use this directly). */
export function buildApiReport(
  rows: UsageRow[],
  period: { from: string; to: string; days: string[] },
  accounts: AccountMeta[],
) {
  const inPeriod = rows.filter(
    (r) => r.day >= period.from && r.day <= period.to,
  );
  const metas = new Map(accounts.map((a) => [keyOf(a.carrier, a.account), a]));
  // accounts no longer in Settings but with traffic in the period, after the configured ones, alphabetically
  const extras = [...new Set(inPeriod.map((r) => keyOf(r.carrier, r.account)))]
    .filter((k) => !metas.has(k))
    .sort();
  for (const k of extras) {
    const [carrier, ...rest] = k.split(":");
    metas.set(k, {
      carrier: carrier as "UPS" | "USPS",
      account: rest.join(":"),
      warehouse: null,
      quoting: false,
    });
  }
  // a colour slot per account in Settings order, so an account keeps its colour whatever the period or ranking
  const slot = new Map([...metas.keys()].map((k, i) => [k, i]));
  const list = [...metas.entries()]
    .map(([key, m]) => ({
      key,
      colorSlot: slot.get(key)!,
      ...m,
      ...figures(
        inPeriod.filter((r) => keyOf(r.carrier, r.account) === key),
        period.days,
      ),
    }))
    // shown: anything with traffic, and every account that quotes (so a silent one stands out)
    .filter((a) => a.requests > 0 || a.tokens > 0 || a.quoting)
    .sort((a, b) =>
      a.carrier === b.carrier
        ? b.requests - a.requests || a.account.localeCompare(b.account)
        : a.carrier === "UPS"
          ? -1
          : 1,
    );
  const daily = period.days.map((day) => {
    const point: Record<string, number | string | boolean> = {
      day,
      estimated: false,
    };
    for (const a of list) point[a.key] = 0;
    for (const r of inPeriod) {
      if (r.day !== day || r.kind !== "rate") continue;
      const k = keyOf(r.carrier, r.account);
      point[k] = (Number(point[k]) || 0) + r.count;
      if (r.source === "estimate") point.estimated = true;
    }
    return point;
  });
  return {
    from: period.from,
    to: period.to,
    dayCount: period.days.length,
    timezone: DEFAULT_TIMEZONE,
    totals: figures(inPeriod, period.days),
    accounts: list,
    daily,
  };
}
export type ApiReport = ReturnType<typeof buildApiReport>;

export async function apiUsageReport(
  s: ShippingRatesSettings,
  q: Pick<ApiReportQuery, "from" | "to" | "days">,
) {
  const period = resolvePeriod(q);
  const rows = await prisma.carrierApiUsage.findMany({
    where: { day: { gte: period.from, lte: period.to } },
    select: {
      day: true,
      carrier: true,
      account: true,
      source: true,
      kind: true,
      outcome: true,
      count: true,
    },
  });
  return buildApiReport(rows, period, accountsFrom(s));
}

const csvCell = (v: unknown) => {
  const t = v == null ? "" : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export function apiReportCsv(r: ApiReport) {
  const head = [
    "Carrier",
    "Account",
    "Warehouse",
    "Quote with",
    "Rate requests",
    "Avg daily",
    "Avg per active day",
    "Active days",
    "Peak day",
    "Peak requests",
    "Errors",
    "Throttled",
    "Token requests",
    "Quote runs",
    "Products runs",
    "Product quotes",
    "Settings tests",
    "Estimated",
  ];
  const line = (
    a:
      | ApiReport["accounts"][number]
      | (ApiReport["totals"] & {
          carrier: string;
          account: string;
          warehouse: null;
          quoting: null;
        }),
  ) =>
    [
      a.carrier,
      a.account,
      a.warehouse ?? "",
      a.quoting == null ? "" : a.quoting ? "yes" : "no",
      a.requests,
      a.avgDaily,
      a.avgActiveDay,
      a.activeDays,
      a.peak?.day ?? "",
      a.peak?.count ?? "",
      a.errors,
      a.throttled,
      a.tokens,
      a.bySource.quote_run,
      a.bySource.product_run,
      a.bySource.product_quote,
      a.bySource.settings_test,
      a.bySource.estimate,
    ]
      .map(csvCell)
      .join(",");
  return (
    [
      `# Carrier API usage ${r.from} to ${r.to} (${r.dayCount} days, Pacific time)`,
      head.join(","),
      ...r.accounts.map(line),
      line({
        ...r.totals,
        carrier: "All",
        account: "",
        warehouse: null,
        quoting: null,
      }),
    ].join("\n") + "\n"
  );
}

// ─── Estimated history ──────────────────────────────────────────────────────

type EstimateRow = {
  day: string;
  carrier: string;
  origin: string;
  failed: boolean;
  n: bigint | number;
};

/**
 * Before usage was recorded, the only trace of API calls is the live quote runs and Products runs still stored.
 * Adds one estimated rate request per saved quote (on the quote's day, for the account that quotes for its
 * warehouse today), only for days before the first recorded call. Runs once: skipped when estimates exist.
 */
export async function backfillApiUsageEstimates(
  s: ShippingRatesSettings,
): Promise<number> {
  if (await prisma.carrierApiUsage.count({ where: { source: "estimate" } }))
    return 0;
  const firstExact =
    (
      await prisma.carrierApiUsage.findFirst({
        where: { source: { not: "estimate" } },
        orderBy: { day: "asc" },
        select: { day: true },
      })
    )?.day ?? "9999-12-31";
  const tz = DEFAULT_TIMEZONE;
  const quoteRuns = await prisma.$queryRaw<EstimateRow[]>`
    SELECT to_char((q."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, q.carrier, q.origin, (q.amount IS NULL) AS failed, COUNT(*) AS n
    FROM "ShippingQuote" q JOIN "ShippingQuoteRun" r ON r.id = q."runId"
    WHERE r.mode = 'live'
    GROUP BY 1, 2, 3, 4`;
  const productRuns = await prisma.$queryRaw<EstimateRow[]>`
    SELECT to_char((i."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, q.carrier, q.origin, (q.amount IS NULL) AS failed, COUNT(*) AS n
    FROM "ProductRateQuote" q JOIN "ProductRateItem" i ON i.id = q."itemId" JOIN "ProductRateRun" r ON r.id = i."runId"
    WHERE r.mode = 'live' AND (q.error IS NULL OR (q.error NOT LIKE 'Over the %' AND q.error NOT LIKE 'No destination ZIP%'))
    GROUP BY 1, 2, 3, 4`;
  const counts = new Map<string, number>();
  for (const r of [...quoteRuns, ...productRuns]) {
    if (r.day >= firstExact) continue;
    const account =
      r.carrier === "UPS" ? upsAccountFor(s, r.origin) : s.endicia.accountId;
    if (!account) continue;
    const key = JSON.stringify([
      r.day,
      r.carrier,
      account,
      r.failed ? "error" : "ok",
    ]);
    counts.set(key, (counts.get(key) ?? 0) + Number(r.n));
  }
  if (!counts.size) return 0;
  const data = [...counts].map(([k, count]) => {
    const [day, carrier, account, outcome] = JSON.parse(k) as string[];
    return {
      day,
      carrier,
      account,
      source: "estimate",
      kind: "rate",
      outcome,
      count,
    };
  });
  await prisma.carrierApiUsage.createMany({ data, skipDuplicates: true });
  const total = data.reduce((n, d) => n + d.count, 0);
  await logAudit({
    action: "shipping.api_usage_estimated",
    category: "TOOL",
    actorEmail: "system",
    metadata: { rows: data.length, requests: total, before: firstExact },
    ip: null,
    userAgent: null,
  });
  return total;
}
