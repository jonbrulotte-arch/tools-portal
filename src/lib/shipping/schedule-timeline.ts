import { nextRun, type Recurrence } from "@/lib/timezone";

// The five Shipping Rates schedules on one timeline, in the order they next run, with warnings for
// combinations that cause trouble. Pure (no database), so Settings can recompute it live while editing.

export type JobKey = "products" | "costImport" | "quoteRun" | "inventory" | "push";
export type TimelineJob = { key: JobKey; name: string; recurrence: Recurrence; lastDurationMs: number | null };
export type TimelineItem = { key: JobKey; name: string; enabled: boolean; next: Date | null; lastDurationMs: number | null; expectedEnd: Date | null };

/** Card names, exactly as Settings shows them. */
export const JOB_NAMES: Record<JobKey, string> = {
  products: "Products (Salsify list)",
  costImport: "Mango cost import",
  quoteRun: "Scheduled quote run",
  inventory: "Mango inventory",
  push: "Push blended cost to Salsify",
};

const WORK_START = 8, WORK_END = 18;

export function buildTimeline(jobs: TimelineJob[], now: Date) {
  const items: TimelineItem[] = jobs.map((j) => {
    const next = nextRun(j.recurrence, now);
    return { key: j.key, name: j.name, enabled: j.recurrence.enabled, next, lastDurationMs: j.lastDurationMs, expectedEnd: next && j.lastDurationMs != null ? new Date(next.getTime() + j.lastDurationMs) : null };
  });
  items.sort((a, b) => (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity));

  const warnings: string[] = [];
  const job = (k: JobKey) => jobs.find((j) => j.key === k)!;
  const item = (k: JobKey) => items.find((i) => i.key === k)!;
  const products = item("products");
  // Products run vs the quote run and the push that follow it
  if (products.next && products.expectedEnd) {
    const quote = nextRun(job("quoteRun").recurrence, new Date(products.next.getTime() - 1));
    if (quote && quote >= products.next && quote < products.expectedEnd)
      warnings.push(`${JOB_NAMES.quoteRun} starts while ${JOB_NAMES.products} is expected to still be running (it took ${hours(products.lastDurationMs!)} last time): both would compete for UPS requests and slow each other down.`);
    const push = nextRun(job("push").recurrence, new Date(products.next.getTime() - 1));
    if (push && push >= products.next && push < products.expectedEnd)
      warnings.push(`${JOB_NAMES.push} starts before ${JOB_NAMES.products} is expected to finish, so it would push the previous week's values.`);
  }
  const inv = job("inventory").recurrence;
  if (inv.enabled && inv.hour >= WORK_START && inv.hour < WORK_END) warnings.push(`${JOB_NAMES.inventory} runs during working hours, reading every product's page from Mango while people use it. Overnight is lighter on Mango.`);
  for (const i of items) if (!i.enabled) warnings.push(`${i.name} is off, so it only runs when started by hand.`);
  return { items, warnings };
}

const hours = (ms: number) => (ms >= 3_600_000 ? `${Math.round(ms / 360_000) / 10} h` : `${Math.round(ms / 60_000)} min`);
