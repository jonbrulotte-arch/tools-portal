// Reads Mango's internal "current_inventory" page for one item (no API exists, so this parses its HTML).
// Pure: no network or database, so it can be tested against a saved copy of the page. Anything that
// doesn't look like the page we know throws, so a layout change shows up as an error, never as zero stock.

export type SiteStock = { onHand: number; allocated: number };
export type MangoShipment = { status: string; tracking: string; carrier: string; upsAccount: string | null; qty: number | null };
export type MangoInventoryPage = {
  partNumber: string;
  description: string | null;
  /** Stock per Mango site number ("0" Las Vegas, "1" Buffalo, "3" Ohio), from the newest snapshot row. */
  sites: Record<string, SiteStock>;
  snapshotAt: string | null;
  /** Orders with this item in the last month that actually shipped (cancelled and untracked ones skipped). */
  shipments: MangoShipment[];
  /** "had N unit sales through mango in the last month". */
  unitsLastMonth: number | null;
};

export class MangoLayoutError extends Error {}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" };
export function cellText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);?/gi, (_, e: string) => ENTITIES[e.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Cell = { html: string; text: string };
/** Tables → rows → cells. Mango's markup is regular (no nested tables), so a small tokenizer is enough. */
export function tables(html: string): Cell[][][] {
  return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(([, t]) =>
    [...t.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(([, tr]) => [...tr.matchAll(/<(t[dh])\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(([, , c]) => ({ html: c, text: cellText(c) }))),
  );
}

const int = (s: string | undefined) => {
  const v = Number((s ?? "").replace(/,/g, ""));
  return Number.isFinite(v) && /\d/.test(s ?? "") ? Math.round(v) : null;
};

/** The 6-character shipper account in a UPS tracking number (1Z + account + …). */
export const upsAccountOf = (tracking: string) => (/^1Z[0-9A-Z]{16}$/i.test(tracking) ? tracking.slice(2, 8).toUpperCase() : null);

export function parseInventoryPage(html: string, partNumber: string): MangoInventoryPage {
  const part = partNumber.trim();
  const fail = (why: string) => {
    throw new MangoLayoutError(`Mango page for item ${part} not recognised: ${why}`);
  };
  const header = html.match(/Inventory History for Item\s*(?:<[^>]+>\s*)*([^<\s]+)/i);
  if (!header) fail("no \"Inventory History for Item\" section (unknown item, or the page layout changed)");
  if (header![1].toUpperCase() !== part.toUpperCase()) fail(`the page is for item ${header![1]}`);

  const all = tables(html);
  const find = (needs: string[]) => {
    for (const t of all)
      for (let r = 0; r < t.length; r++) {
        const names = t[r].map((c) => c.text);
        if (needs.every((n) => names.includes(n))) return { rows: t, at: r, col: (n: string) => names.indexOf(n) };
      }
    return null;
  };

  // stock: the snapshot table ("Quantity Site N" / "Allocated Site N"), newest row first
  const snap = find(["Update Date", "Quantity on Hand"]);
  if (!snap) fail("no inventory snapshot table");
  const headers = snap!.rows[snap!.at].map((c) => c.text);
  const siteNums = headers.map((h) => h.match(/^Quantity Site (\d+)$/)?.[1]).filter((n): n is string => !!n);
  if (!siteNums.length) fail("no \"Quantity Site\" columns");
  const row = snap!.rows[snap!.at + 1];
  const sites: Record<string, SiteStock> = {};
  if (row) {
    for (const n of siteNums) {
      const onHand = int(row[snap!.col(`Quantity Site ${n}`)]?.text);
      const allocated = int(row[snap!.col(`Allocated Site ${n}`)]?.text);
      if (onHand == null) fail(`Site ${n} quantity isn't a number`);
      sites[n] = { onHand: onHand!, allocated: allocated ?? 0 };
    }
  }

  // shipments: the "Orders With This Item" table
  const shipments: MangoShipment[] = [];
  const orders = find(["Status", "Tracking Number", "Carrier", "Items Array"]);
  if (orders) {
    for (const r of orders.rows.slice(orders.at + 1)) {
      const statusCell = r[orders.col("Status")];
      if (!statusCell) continue;
      const status = statusCell.html.match(/<span[^>]*badge[^>]*>([^<]*)</i)?.[1]?.trim() ?? statusCell.text.replace(/\s*Update$/, "");
      const tracking = (r[orders.col("Tracking Number")]?.text ?? "").replace(/\s/g, "");
      if (/cancel/i.test(status) || !tracking) continue;
      const items = r[orders.col("Items Array")]?.text ?? "";
      const mine = [...items.matchAll(/ID:\s*(\S+)\s*Qty:\s*(\d+)/gi)].find(([, id]) => id.toUpperCase() === part.toUpperCase());
      shipments.push({ status, tracking, carrier: r[orders.col("Carrier")]?.text ?? "", upsAccount: upsAccountOf(tracking), qty: mine ? Number(mine[2]) : null });
    }
  }

  const page = cellText(html);
  const desc = all.flat(2).find((c) => /^Item Description\b/.test(c.text))?.text.replace(/^Item Description\s*/, "") || null;
  return {
    partNumber: part,
    description: desc,
    sites,
    snapshotAt: row ? (row[snap!.col("Update Date")]?.text ?? null) : null,
    shipments,
    unitsLastMonth: int(page.match(/had ([\d,]+) unit sales/i)?.[1]),
  };
}

/** Stock and shipments per warehouse code, using the site → warehouse and UPS account → warehouse maps from Settings. */
export function summarizeInventory(p: MangoInventoryPage, siteToOrigin: Record<string, string>, upsAccounts: Record<string, string>) {
  const stock: Record<string, SiteStock> = {};
  for (const [site, origin] of Object.entries(siteToOrigin)) if (p.sites[site]) stock[origin] = p.sites[site];
  const shipments: Record<string, number> = {};
  let other = 0;
  for (const s of p.shipments) {
    const origin = s.upsAccount ? upsAccounts[s.upsAccount] : undefined;
    if (origin) shipments[origin] = (shipments[origin] ?? 0) + 1;
    else other++;
  }
  return { stock, shipments, otherShipments: other };
}
