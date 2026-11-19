import { prisma } from "@/lib/prisma";
import { DEFAULT_TIMEZONE, zonedParts } from "@/lib/timezone";

// Counts real carrier API calls (API Report tab). Calls are buffered in memory and written as per-day
// counters every few seconds, so a 4,500-quote run doesn't mean 4,500 database writes. Recording never
// fails a quote: write errors are logged and the counts dropped.

export const API_SOURCES = [
  "quote_run",
  "product_run",
  "product_quote",
  "settings_test",
  "estimate",
] as const;
export type ApiSource = (typeof API_SOURCES)[number];
export type ApiKind = "rate" | "token";
export type ApiOutcome = "ok" | "error" | "throttled";
export type ApiCall = {
  carrier: "UPS" | "USPS";
  account: string;
  source: ApiSource;
  kind: ApiKind;
  outcome: ApiOutcome;
};

/** The Pacific calendar day (YYYY-MM-DD) a call is counted on. */
export const usageDay = (at: Date = new Date()) =>
  zonedParts(at, DEFAULT_TIMEZONE).date;

/** HTTP status → outcome: throttling (429) and "busy" (503) are counted apart from other failures. */
export const outcomeFor = (status: number): ApiOutcome =>
  status === 429 || status === 503
    ? "throttled"
    : status >= 200 && status < 300
      ? "ok"
      : "error";

const FLUSH_MS = 10_000;
const g = globalThis as unknown as {
  __apiUsage?: {
    buffer: Map<string, number>;
    timer: NodeJS.Timeout | null;
    flushing: Promise<void> | null;
  };
};
const state = (g.__apiUsage ??= {
  buffer: new Map(),
  timer: null,
  flushing: null,
});

export function recordApiCall(call: ApiCall, at: Date = new Date()) {
  const key = JSON.stringify([
    usageDay(at),
    call.carrier,
    call.account || "(none)",
    call.source,
    call.kind,
    call.outcome,
  ]);
  state.buffer.set(key, (state.buffer.get(key) ?? 0) + 1);
  if (!state.timer) {
    state.timer = setTimeout(() => void flushApiUsage(), FLUSH_MS);
    state.timer.unref?.();
  }
}

/** Writes the buffered counts. Safe to call any time (e.g. when a run or a single quote finishes). */
export async function flushApiUsage(): Promise<void> {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  if (state.flushing) await state.flushing;
  if (!state.buffer.size) return;
  const batch = [...state.buffer.entries()];
  state.buffer.clear();
  state.flushing = (async () => {
    try {
      await prisma.$transaction(
        batch.map(([key, n]) => {
          const [day, carrier, account, source, kind, outcome] = JSON.parse(
            key,
          ) as string[];
          return prisma.carrierApiUsage.upsert({
            where: {
              day_carrier_account_source_kind_outcome: {
                day,
                carrier,
                account,
                source,
                kind,
                outcome,
              },
            },
            create: { day, carrier, account, source, kind, outcome, count: n },
            update: { count: { increment: n } },
          });
        }),
      );
    } catch (err) {
      console.error("[shipping] couldn't record carrier API usage", err);
    } finally {
      state.flushing = null;
    }
  })();
  await state.flushing;
}

/** Calls still waiting to be written (tests). */
export const pendingApiCalls = () =>
  [...state.buffer.entries()].map(([k, n]) => ({
    key: JSON.parse(k) as string[],
    count: n,
  }));
/** Drops buffered calls without writing them (tests). */
export const clearPendingApiCalls = () => state.buffer.clear();
