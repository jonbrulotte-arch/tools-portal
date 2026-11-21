import { z } from "zod";
import type { BlendSummary } from "@/lib/shipping/blended-view";

// What goes into Salsify for one product: one multi-value property holding, in this order,
//   [ blended cost (amount only), a note (OK or the issue with the price), the date it was pushed ].
// The note is never empty, so the three positions never shift.

export type PushValue = { cost: string; note: string };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "OK: <basis>", or the issues with the price joined by "; ". Pure. */
export function pushNote(b: Pick<BlendSummary, "incomplete" | "coverage" | "basis" | "label" | "understates" | "shares" | "shipments">, origins: { code: string; name: string }[]): string {
  const name = (c: string) => origins.find((o) => o.code === c)?.name ?? c;
  const issues: string[] = [];
  if (b.incomplete) issues.push(`Incomplete: only ${pct(b.coverage)} of orders priced (some zones over a carrier limit or failed)`);
  if (b.understates) {
    const from = Object.keys(b.shares).find((c) => b.shares[c] > 0);
    issues.push(b.basis === "stock-both" ? `Stocked in both; ships from ${from ? name(from) : "the warehouse with most stock"} (most stock); may understate` : `Stocked in ${from ? name(from) : "one warehouse"} only; may understate`);
  }
  if (b.basis === "company" && /No Mango|No stock/.test(b.label)) issues.push(/No stock/.test(b.label) ? "No stock or shipments in Mango: company-wide split" : "No Mango data: company-wide split");
  if (b.basis === "few-shipments") issues.push(`Few shipments (${Object.values(b.shipments).reduce((a, n) => a + n, 0)})`);
  if (issues.length) return issues.join("; ").slice(0, 250);
  return `OK: ${lower(b.label)}`.slice(0, 250);
}

/** The value to store for a product, or null when there's no cost to give. */
export function pushValue(b: BlendSummary | null, origins: { code: string; name: string }[]): PushValue | null {
  if (!b || b.cost == null) return null;
  return { cost: b.cost.toFixed(2), note: pushNote(b, origins) };
}

/** The three Salsify values, in order. `day` is YYYY-MM-DD (Pacific). */
export const pushValues = (v: PushValue, day: string) => [v.cost, v.note, day];

/** Only write when the cost (to the cent) or the note changed; the date alone never triggers a write. */
export const isChanged = (prev: { cost: string; note: string } | null | undefined, next: PushValue) => !prev || prev.cost !== next.cost || prev.note !== next.note;

export const salsifyPushTestSchema = z.object({ partNumber: z.string().trim().min(1, "Enter a part number").max(100), write: z.boolean().optional() });
