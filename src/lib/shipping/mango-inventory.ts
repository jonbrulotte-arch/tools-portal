import { prisma } from "@/lib/prisma";
import { getSetting, type ShippingRatesSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/api";
import { isDue } from "@/lib/timezone";
import { iterateSalsifyList } from "@/lib/salsify";
import { resolveKey } from "@/lib/shipping/product-rates";
import { parseInventoryPage, summarizeInventory, type MangoInventoryPage, type SiteStock, type TrackingOrigins } from "@/lib/shipping/mango-inventory-parse";

// Reads each product's stock (per warehouse) and last month's shipments from Mango's inventory page,
// for the blended shipping cost. Mango has no API, so this loads the page per item: a few at a time,
// nightly, plus on demand for a single part (Product quote, Settings test).

export const INVENTORY_ACTOR = { id: null, email: "Mango inventory" } as const;
type Actor = { id: string | null; email: string };
const TIMEOUT_MS = 30_000;
const CONCURRENCY = 3;

export type ItemInventory = {
  partNumber: string;
  description: string | null;
  stock: Record<string, SiteStock>;
  shipments: Record<string, number>;
  /** Placed shipments per carrier (keys in CARRIER_LABELS: UPS prepaid, UPS collect, UPS pending, USPS). */
  shipmentCarriers: Record<string, number>;
  /** Placed shipments billed collect or to a third party, per warehouse. */
  collectShipments: Record<string, number>;
  otherShipments: number;
  unitsLastMonth: number | null;
  snapshotAt: string | null;
  fetchedAt: string | null;
  error: string | null;
};

/** Mango's page address for one item. */
export function inventoryUrl(s: Pick<ShippingRatesSettings, "mangoInventory">, part: string) {
  const u = new URL(s.mangoInventory.url);
  u.searchParams.set("it", part);
  return u.toString();
}

/** Loads and parses one item's page (no database). Throws with a readable reason. */
export async function fetchInventoryPage(s: Pick<ShippingRatesSettings, "mangoInventory">, part: string): Promise<MangoInventoryPage> {
  const url = inventoryUrl(s, part);
  let res: Response | null = null;
  for (let attempt = 1; attempt <= 2 && !res; attempt++) {
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "text/html" } });
    } catch (err) {
      const e = err as Error & { cause?: { code?: string } };
      if (attempt === 2) throw new Error(e.name === "TimeoutError" ? `Mango didn't answer within ${TIMEOUT_MS / 1000}s` : `Couldn't connect to Mango (${e.cause?.code ?? e.message})`);
    }
  }
  if (!res!.ok) throw new Error(`Mango answered HTTP ${res!.status} for item ${part}`);
  return parseInventoryPage(await res!.text(), part);
}

/** Warehouse code → Mango site number, as an index the other way (site → warehouse). */
const siteIndex = (s: ShippingRatesSettings) => Object.fromEntries(Object.entries(s.mangoInventory.sites).filter(([, site]) => site !== "").map(([origin, site]) => [site, origin]));

/** Which warehouse shipped each of these tracking numbers, per the imported cost reports. */
export async function trackingOrigins(trackings: string[]): Promise<TrackingOrigins> {
  const keys = [...new Set(trackings.map((t) => t.toUpperCase()).filter(Boolean))];
  if (!keys.length) return new Map();
  const rows = await prisma.shipmentOrigin.findMany({ where: { tracking: { in: keys } }, select: { tracking: true, origin: true, carrier: true, billing: true } });
  return new Map(rows.map((r) => [r.tracking.toUpperCase(), { origin: r.origin, carrier: r.carrier, billing: r.billing }]));
}

/** Stock and shipments per warehouse for one parsed page (USPS and UPS placed by tracking number). */
export async function summarizePage(s: ShippingRatesSettings, page: MangoInventoryPage) {
  return summarizeInventory(page, siteIndex(s), s.upsAccounts, await trackingOrigins(page.shipments.map((x) => x.tracking)));
}

/** Reads one item from Mango and saves it. On failure the last good figures are kept and the error recorded. */
export async function refreshItemInventory(s: ShippingRatesSettings, part: string): Promise<ItemInventory> {
  try {
    const page = await fetchInventoryPage(s, part);
    const sum = await summarizePage(s, page);
    const data = { description: page.description, stock: sum.stock, shipments: sum.shipments, shipmentCarriers: sum.shipmentCarriers, collectShipments: sum.collectShipments, billingChecked: true, otherShipments: sum.otherShipments, unitsLastMonth: page.unitsLastMonth, snapshotAt: page.snapshotAt, fetchedAt: new Date(), error: null, errorAt: null };
    return toItem(await prisma.productInventory.upsert({ where: { partNumber: part }, create: { partNumber: part, ...data }, update: data }));
  } catch (err) {
    const error = errorMessage(err).slice(0, 500);
    return toItem(await prisma.productInventory.upsert({ where: { partNumber: part }, create: { partNumber: part, error, errorAt: new Date() }, update: { error, errorAt: new Date() } }));
  }
}

type Row = Awaited<ReturnType<typeof prisma.productInventory.findFirstOrThrow>>;

/** Counts saved before who paid was recorded can't call their UPS shipments prepaid: they're "not known yet" until the next read. */
function billingKnown(carriers: Record<string, number> | null, checked: boolean): Record<string, number> {
  const c = { ...(carriers ?? {}) };
  if (!checked && c.UPS) {
    c["UPS pending"] = (c["UPS pending"] ?? 0) + c.UPS;
    delete c.UPS;
  }
  return c;
}
export function toItem(r: Row): ItemInventory {
  return {
    partNumber: r.partNumber,
    description: r.description,
    stock: (r.stock ?? {}) as Record<string, SiteStock>,
    shipments: (r.shipments ?? {}) as Record<string, number>,
    shipmentCarriers: billingKnown(r.shipmentCarriers as Record<string, number> | null, r.billingChecked),
    collectShipments: (r.collectShipments ?? {}) as Record<string, number>,
    otherShipments: r.otherShipments,
    unitsLastMonth: r.unitsLastMonth,
    snapshotAt: r.snapshotAt,
    fetchedAt: r.fetchedAt?.toISOString() ?? null,
    error: r.error,
  };
}

export async function loadInventory(parts: string[]): Promise<Map<string, ItemInventory>> {
  if (!parts.length) return new Map();
  const rows = await prisma.productInventory.findMany({ where: { partNumber: { in: parts } } });
  return new Map(rows.map((r) => [r.partNumber, toItem(r)]));
}

/**
 * The items to read: the newest completed Products run's part numbers (a cancelled or failed run only holds the
 * products it got through, so it's used only if no run ever completed), else the Salsify list itself.
 */
async function itemsToRead(s: ShippingRatesSettings, actor: Actor): Promise<string[]> {
  const run =
    (await prisma.productRateRun.findFirst({ where: { status: "READY" }, orderBy: { createdAt: "desc" }, select: { id: true } })) ??
    (await prisma.productRateRun.findFirst({ where: { status: { in: ["FAILED", "CANCELLED"] }, done: { gt: 0 } }, orderBy: { createdAt: "desc" }, select: { id: true } }));
  if (run) {
    const items = await prisma.productRateItem.findMany({ where: { runId: run.id }, select: { partNumber: true }, orderBy: { position: "asc" } });
    return [...new Set(items.map((i) => i.partNumber))];
  }
  const { key } = await resolveKey(s, actor);
  const parts: string[] = [];
  for await (const page of iterateSalsifyList(key, s.salsify.orgId, s.productRates.listId, s.salsify.fields)) parts.push(...page.products.map((p) => p.partNumber));
  return [...new Set(parts)];
}

/** Starts a full import in the background; `finished` resolves when it ends. */
export async function startInventoryImport(actor: Actor) {
  const busy = await prisma.inventoryImportRun.findFirst({ where: { status: { in: ["PENDING", "RUNNING"] } } });
  if (busy) throw new Error("A Mango inventory import is already running.");
  const s = await getSetting("shippingRates");
  if (!Object.values(s.mangoInventory.sites).some(Boolean)) throw new Error("Set which Mango site is which warehouse first (Settings → Mango inventory).");
  const run = await prisma.inventoryImportRun.create({ data: { status: "PENDING", startedById: actor.id, startedBy: actor.email } });
  const ipless = actor.id ? {} : { ip: null, userAgent: null };
  await logAudit({ action: "shipping.inventory_import_started", category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: "InventoryImportRun", targetId: run.id, ...ipless });
  const finished = executeImport(run.id, s, actor);
  return { run, finished };
}

async function executeImport(runId: string, s: ShippingRatesSettings, actor: Actor) {
  const audit = (action: string, success: boolean, metadata: Record<string, unknown>) =>
    logAudit({ action, category: "TOOL", actorId: actor.id, actorEmail: actor.email, success, targetType: "InventoryImportRun", targetId: runId, metadata, ip: null, userAgent: null });
  try {
    const parts = await itemsToRead(s, actor);
    await prisma.inventoryImportRun.update({ where: { id: runId }, data: { status: "RUNNING", total: parts.length } });
    let next = 0, done = 0, failed = 0;
    const errors: string[] = [];
    const worker = async () => {
      while (next < parts.length) {
        const item = await refreshItemInventory(s, parts[next++]);
        done++;
        if (item.error) {
          failed++;
          if (errors.length < 5) errors.push(item.error);
        }
        if (done % 10 === 0 || done === parts.length) await prisma.inventoryImportRun.update({ where: { id: runId }, data: { done, failed } });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    // every item failing usually means Mango is down or its page changed: mark the run failed so it's noticed
    const status = parts.length > 0 && failed === parts.length ? "FAILED" : "READY";
    await prisma.inventoryImportRun.update({ where: { id: runId }, data: { status, done, failed, finishedAt: new Date(), error: status === "FAILED" ? `Every item failed, e.g. ${errors[0]}` : null } });
    await audit(`shipping.inventory_import_${status.toLowerCase()}`, status === "READY", { items: parts.length, failed, sampleErrors: errors });
  } catch (err) {
    await prisma.inventoryImportRun.update({ where: { id: runId }, data: { status: "FAILED", error: errorMessage(err).slice(0, 500), finishedAt: new Date() } });
    await audit("shipping.inventory_import_failed", false, { error: errorMessage(err) });
  }
}

export async function inventoryStatus() {
  const [last, items, withErrors, errorSamples] = await Promise.all([
    prisma.inventoryImportRun.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.productInventory.count(),
    prisma.productInventory.count({ where: { error: { not: null } } }),
    prisma.productInventory.findMany({ where: { error: { not: null } }, orderBy: { errorAt: "desc" }, take: 10, select: { partNumber: true, error: true } }),
  ]);
  return {
    last: last ? { id: last.id, status: last.status, total: last.total, done: last.done, failed: last.failed, error: last.error, startedBy: last.startedBy, createdAt: last.createdAt.toISOString(), finishedAt: last.finishedAt?.toISOString() ?? null } : null,
    items,
    withErrors,
    errorSamples,
  };
}
export type InventoryStatus = Awaited<ReturnType<typeof inventoryStatus>>;

/** Called every hour on the hour by the app scheduler. */
export async function runScheduledInventoryImport(at = new Date()) {
  const s = await getSetting("shippingRates");
  if (!isDue(s.mangoInventory, at)) return;
  try {
    await (await startInventoryImport(INVENTORY_ACTOR)).finished;
  } catch (err) {
    await logAudit({ action: "shipping.inventory_import_skipped", category: "TOOL", actorEmail: INVENTORY_ACTOR.email, success: false, metadata: { reason: errorMessage(err) }, ip: null, userAgent: null });
  }
}
