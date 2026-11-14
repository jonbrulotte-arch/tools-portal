import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting, type ShippingRatesSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/api";
import { fetchSalsifyList, type SalsifyProduct } from "@/lib/salsify";
import { getUserSecret } from "@/lib/user-credentials";
import { billable } from "@/lib/shipping/dims";
import type { ThrottleGate } from "@/lib/shipping/carriers";
import { prepareQuoteContext, quoteProductWith, type QuoteContext } from "@/lib/shipping/product-quote";
import { isDue } from "@/lib/timezone";

// Products tab: reads every product on a Salsify list, then quotes them one at a time (42 live quotes
// each: 2 warehouses × zones 2–8 × USPS Ground Advantage, UPS Ground commercial and residential) and
// stores the results so the tab can browse them. Runs weekly and on demand; old runs are pruned.

export const PRODUCT_SCHEDULE_ACTOR = { id: null, email: "products schedule" } as const;
type Actor = { id: string | null; email: string };

const dec = (n: number | null | undefined) => (n == null ? null : new Prisma.Decimal(n));

/** The Salsify key a run uses: the person's own for "Run now", else the user chosen in Settings. */
async function resolveKey(s: ShippingRatesSettings, actor: Actor) {
  if (actor.id) {
    const own = await getUserSecret(actor.id, "salsify");
    if (own) return { key: own, owner: actor.email };
  }
  const keyUserId = s.productRates.keyUserId;
  if (!keyUserId) throw new Error(actor.id ? "Add your Salsify API key in My Profile, or choose whose key Products runs use in Settings → Products." : "No user is chosen for scheduled Products runs (Settings → Products).");
  const key = await getUserSecret(keyUserId, "salsify");
  if (!key) throw new Error("The user chosen for Products runs no longer has a saved Salsify key.");
  const owner = (await prisma.user.findUnique({ where: { id: keyUserId }, select: { email: true } }))?.email ?? "chosen user";
  return { key, owner };
}

/** Stores one product's result (and its quotes) as soon as it's done. */
async function saveItem(runId: string, position: number, p: SalsifyProduct, s: ShippingRatesSettings, ctx: QuoteContext, gate: ThrottleGate) {
  const base = {
    runId,
    position,
    partNumber: p.partNumber,
    name: p.name,
    packaging: p.packaging,
    weight: dec(p.weight),
    length: dec(p.length),
    width: dec(p.width),
    height: dec(p.height),
    sizeSource: p.source,
  };
  const missing = (["weight", "length", "width", "height"] as const).filter((k) => p[k] == null);
  if (missing.length) {
    await prisma.productRateItem.create({ data: { ...base, status: "NO_DATA", error: `Salsify has no ${missing.join(", ")} for this part` } });
    return "NO_DATA" as const;
  }
  const dims = { length: p.length!, width: p.width!, height: p.height! };
  const b = billable(p.weight!, dims);
  const { rows } = await quoteProductWith(ctx, s, { partNumber: p.partNumber, weight: p.weight!, dims, origins: s.origins.map((o) => o.code) }, gate);
  const failedAll = rows.every((r) => r.live == null);
  await prisma.productRateItem.create({
    data: {
      ...base,
      upsBillable: dec(b.ups),
      uspsBillable: dec(b.usps),
      status: failedAll ? "FAILED" : "OK",
      error: failedAll ? rows.find((r) => r.error)?.error ?? "Every quote failed" : null,
      quotes: {
        create: rows.map((r) => ({
          origin: r.origin,
          zone: r.zone,
          carrier: r.carrier,
          service: r.service,
          destZip: r.destZip,
          amount: dec(r.live),
          listAmount: dec(r.listAmount),
          negotiated: r.negotiated,
          chart: dec(r.chart),
          diffPct: dec(r.diffPct),
          error: r.error,
        })),
      },
    },
  });
  return failedAll ? ("FAILED" as const) : ("OK" as const);
}

/** Starts a run in the background; `finished` resolves when it ends. */
export async function startProductRun(actor: Actor) {
  const busy = await prisma.productRateRun.findFirst({ where: { status: { in: ["PENDING", "RUNNING"] } } });
  if (busy) throw new Error("A Products run is already in progress. Wait for it to finish or cancel it.");
  const s = await getSetting("shippingRates");
  if (!s.productRates.listId) throw new Error("Set the Salsify list in Settings → Products first.");
  const { key, owner } = await resolveKey(s, actor);
  const ctx = await prepareQuoteContext(s);
  const run = await prisma.productRateRun.create({ data: { mode: s.mode, status: "PENDING", startedById: actor.id, startedBy: actor.email, listId: s.productRates.listId, comparedRunId: ctx.run?.id ?? null } });
  await logAudit({ action: "shipping.product_run_started", category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: "ProductRateRun", targetId: run.id, metadata: { listId: s.productRates.listId, mode: s.mode, salsifyKeyOf: owner }, ...(actor.id ? {} : { ip: null, userAgent: null }) });
  const finished = executeProductRun(run.id, s, key, ctx, actor);
  return { run, finished };
}

async function executeProductRun(runId: string, s: ShippingRatesSettings, key: string, ctx: QuoteContext, actor: Actor) {
  const audit = (action: string, success: boolean, metadata: Record<string, unknown>) =>
    logAudit({ action, category: "TOOL", actorId: actor.id, actorEmail: actor.email, success, targetType: "ProductRateRun", targetId: runId, metadata, ip: null, userAgent: null });
  try {
    await prisma.productRateRun.update({ where: { id: runId }, data: { status: "RUNNING", startedAt: new Date() } });
    const products = await fetchSalsifyList(key, s.salsify.orgId, s.productRates.listId, s.salsify.fields);
    await prisma.productRateRun.update({ where: { id: runId }, data: { total: products.length } });
    const gate: ThrottleGate = {};
    let done = 0, failed = 0;
    for (const [i, p] of products.entries()) {
      // stop between products when cancelled
      const cur = await prisma.productRateRun.findUnique({ where: { id: runId }, select: { status: true } });
      if (cur?.status === "CANCELLED") {
        await prisma.productRateRun.update({ where: { id: runId }, data: { finishedAt: new Date() } });
        await audit("shipping.product_run_cancelled", true, { done, total: products.length });
        return;
      }
      let result: "OK" | "NO_DATA" | "FAILED";
      try {
        result = await saveItem(runId, i, p, s, ctx, gate);
      } catch (err) {
        await prisma.productRateItem.create({ data: { runId, position: i, partNumber: p.partNumber, name: p.name, status: "FAILED", error: errorMessage(err).slice(0, 500) } });
        result = "FAILED";
      }
      done++;
      if (result !== "OK") failed++;
      await prisma.productRateRun.update({ where: { id: runId }, data: { done, failed } });
    }
    const status = products.length > 0 && failed === products.length ? "FAILED" : "READY";
    await prisma.productRateRun.update({ where: { id: runId }, data: { status, finishedAt: new Date(), error: status === "FAILED" ? "No product could be quoted; see the errors in the list." : null } });
    await audit(`shipping.product_run_${status.toLowerCase()}`, status !== "FAILED", { products: products.length, notQuoted: failed });
  } catch (err) {
    await prisma.productRateRun.update({ where: { id: runId }, data: { status: "FAILED", error: errorMessage(err).slice(0, 500), finishedAt: new Date() } });
    await audit("shipping.product_run_failed", false, { error: errorMessage(err) });
  }
}

/** Keeps the newest `keep` finished runs (their products and quotes go with them). */
export async function pruneProductRuns(keep: number) {
  const old = await prisma.productRateRun.findMany({ where: { status: { notIn: ["PENDING", "RUNNING"] } }, orderBy: { createdAt: "desc" }, skip: keep, select: { id: true } });
  if (!old.length) return 0;
  await prisma.productRateRun.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
  await logAudit({ action: "shipping.product_runs_pruned", category: "TOOL", actorEmail: PRODUCT_SCHEDULE_ACTOR.email, metadata: { deleted: old.length, kept: keep }, ip: null, userAgent: null });
  return old.length;
}

/** Called every hour on the hour by the app scheduler. */
export async function runScheduledProductRates(at = new Date()) {
  const s = await getSetting("shippingRates");
  if (!isDue(s.productRates, at)) return;
  const skip = (reason: string) => logAudit({ action: "shipping.product_run_skipped", category: "TOOL", actorEmail: PRODUCT_SCHEDULE_ACTOR.email, metadata: { reason }, ip: null, userAgent: null });
  if (s.mode !== "live") return skip("The tool is in simulated mode");
  try {
    const { finished } = await startProductRun(PRODUCT_SCHEDULE_ACTOR);
    await finished;
    await pruneProductRuns(s.productRates.keepRuns);
  } catch (err) {
    await skip(errorMessage(err));
  }
}
