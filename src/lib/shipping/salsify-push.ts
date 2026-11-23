import { prisma } from "@/lib/prisma";
import { getSetting, type ShippingRatesSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/api";
import { isDue } from "@/lib/timezone";
import { getSalsifyProperty, readSalsifyValues, updateSalsifyProduct } from "@/lib/salsify";
import { resolveKey } from "@/lib/shipping/product-rates";
import { usageDay } from "@/lib/shipping/api-usage";
import { loadMix } from "@/lib/shipping/blended-cost";
import { blendContext, blendFor, ratesForItems, summaryOf } from "@/lib/shipping/blended-view";
import { isChanged, pushValue, pushValues, type PushValue } from "@/lib/shipping/blended-push";

// Pushes each product's blended cost to a Salsify property, on a schedule or on demand. The property
// holds three values: [cost, note, date pushed]. Only products whose cost or note changed are written.
// Never pushes simulated prices.

export const PUSH_ACTOR = { id: null, email: "Salsify push schedule" } as const;
type Actor = { id: string | null; email: string };
const CONCURRENCY = 3;
const BATCH = 200;
const MAX_PROBLEMS = 200;
const PAUSE_MS = 150; // between writes per worker, to stay well inside Salsify's rate limits

export type PushProblem = { partNumber: string; reason: string };

/** The newest finished Products run with quotes, and whether it can be pushed. */
/**
 * The Products run blended costs come from: the newest COMPLETED live run. Cancelled and failed runs only hold
 * the products they got through, so they're never used; nor are simulated runs.
 */
async function sourceRun() {
  return prisma.productRateRun.findFirst({ where: { status: "READY", mode: "live" }, orderBy: { createdAt: "desc" }, select: { id: true, mode: true, createdAt: true } });
}
const runDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

/** Why a push can't run now, or null if it can. */
export async function pushBlocker(s: ShippingRatesSettings): Promise<string | null> {
  if (!s.salsifyPush.property) return "Set the Salsify property first (Settings → Push blended cost to Salsify).";
  if (s.mode !== "live") return "The tool is in simulated mode; simulated prices are never pushed to Salsify. Switch Rates source to Live (Settings) once UPS and Endicia test successfully.";
  const run = await sourceRun();
  if (!run) {
    const any = await prisma.productRateRun.findFirst({ where: { status: "READY" }, select: { id: true } });
    return any
      ? "There's no completed Products run with live prices yet (simulated runs are never pushed). Run Products in live mode (Products tab → Run now) and let it finish."
      : "There's no completed Products run yet (cancelled and failed runs aren't used). Run Products (Products tab → Run now) and let it finish.";
  }
  if (!(await loadMix())) return "A processed cost report is needed for the zone mix (Cost reports tab).";
  return null;
}

/** One product's value from the newest Products run (for the Settings test), with why there isn't one. */
export async function valueFor(s: ShippingRatesSettings, partNumber: string): Promise<{ value: PushValue | null; reason: string | null; runMode: string | null }> {
  const run = await sourceRun();
  if (!run) return { value: null, reason: "There's no completed live Products run yet.", runMode: null };
  const item = await prisma.productRateItem.findFirst({ where: { runId: run.id, partNumber }, select: { id: true, status: true, error: true, upsBillable: true } });
  if (!item) return { value: null, reason: `${partNumber} isn't in the Products run of ${runDate(run.createdAt)}, the newest completed live run (cancelled and failed runs aren't used). Is it on the Salsify list?`, runMode: run.mode };
  if (item.status !== "OK") return { value: null, reason: `${partNumber} wasn't quoted: ${item.error ?? item.status}`, runMode: run.mode };
  const [rates, ctx] = await Promise.all([ratesForItems([item.id]), blendContext([partNumber])]);
  const blended = summaryOf(blendFor(ctx, partNumber, rates.get(item.id) ?? [], item.upsBillable == null ? null : Number(item.upsBillable)));
  const value = pushValue(blended, s.origins);
  return { value, reason: value ? null : blended ? "No zone could be priced, so there's no cost." : "A processed cost report is needed for the zone mix.", runMode: run.mode };
}

/** The property's problems for this push: missing (error) or the wrong kind (error/warning). */
async function checkProperty(s: ShippingRatesSettings, key: string) {
  const prop = await getSalsifyProperty(key, s.salsify.orgId, s.salsifyPush.property);
  if (!prop) return { prop: null, error: `Salsify has no property "${s.salsifyPush.property}". Use the property's ID exactly as Salsify shows it.`, warnings: [] as string[] };
  const error = prop.dataType && !/string|text|rich/i.test(prop.dataType) ? `"${prop.id}" is a ${prop.dataType} property, but the note and date are text: use a text property that allows multiple values.` : null;
  const warnings = prop.multiValued === false ? ["it holds a single value, but three are written (cost, note, date): allow multiple values on it"] : [];
  return { prop, error, warnings };
}

/** Writes one product now (Settings "Write this one product") and reads it back. Every check explains itself. */
export async function pushOne(s: ShippingRatesSettings, actor: Actor, partNumber: string) {
  const blocker = await pushBlocker(s);
  if (blocker) throw new Error(blocker);
  const { key } = await resolveKey(s, actor);
  const { error } = await checkProperty(s, key);
  if (error) throw new Error(error);
  const { value, reason } = await valueFor(s, partNumber);
  if (!value) throw new Error(reason ?? "Nothing to push for this product.");
  const values = pushValues(value, usageDay());
  await updateSalsifyProduct(key, s.salsify.orgId, partNumber, s.salsifyPush.property, values);
  await prisma.salsifyPush.upsert({ where: { partNumber }, create: { partNumber, ...value, pushedAt: new Date() }, update: { ...value, pushedAt: new Date(), lastError: null, lastErrorAt: null } });
  const readBack = await readSalsifyValues(key, s.salsify.orgId, partNumber, s.salsifyPush.property);
  await logAudit({ action: "shipping.salsify_push_one", category: "TOOL", actorId: actor.id, actorEmail: actor.email, metadata: { partNumber, property: s.salsifyPush.property, values } });
  return { values, readBack };
}

export async function startSalsifyPush(actor: Actor) {
  const busy = await prisma.salsifyPushRun.findFirst({ where: { status: { in: ["PENDING", "RUNNING"] } } });
  if (busy) throw new Error("A Salsify push is already running.");
  const s = await getSetting("shippingRates");
  const blocker = await pushBlocker(s);
  if (blocker) throw new Error(blocker);
  const { key, owner } = await resolveKey(s, actor);
  const source = (await sourceRun())!;
  const run = await prisma.salsifyPushRun.create({ data: { status: "PENDING", startedById: actor.id, startedBy: actor.email, property: s.salsifyPush.property, productRunId: source.id } });
  const ipless = actor.id ? {} : { ip: null, userAgent: null };
  await logAudit({ action: "shipping.salsify_push_started", category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: "SalsifyPushRun", targetId: run.id, metadata: { property: s.salsifyPush.property, productRunId: source.id, salsifyKeyOf: owner }, ...ipless });
  const finished = executePush(run.id, s, key, source.id, actor);
  return { run, finished };
}

async function executePush(runId: string, s: ShippingRatesSettings, key: string, productRunId: string, actor: Actor) {
  const audit = (action: string, success: boolean, metadata: Record<string, unknown>) =>
    logAudit({ action, category: "TOOL", actorId: actor.id, actorEmail: actor.email, success, targetType: "SalsifyPushRun", targetId: runId, metadata, ip: null, userAgent: null });
  const counts = { done: 0, written: 0, unchanged: 0, skipped: 0, failed: 0 };
  const problems: PushProblem[] = [];
  const writtenSample: { partNumber: string; cost: string; note: string }[] = [];
  const problem = (partNumber: string, reason: string) => problems.length < MAX_PROBLEMS && problems.push({ partNumber, reason });
  const save = () => prisma.salsifyPushRun.update({ where: { id: runId }, data: { ...counts, problems } });
  const day = usageDay();
  let authFailures = 0;
  let stopped = false;
  try {
    const items = await prisma.productRateItem.findMany({ where: { runId: productRunId }, orderBy: { position: "asc" }, select: { id: true, partNumber: true, status: true, error: true, upsBillable: true } });
    await prisma.salsifyPushRun.update({ where: { id: runId }, data: { status: "RUNNING", products: items.length } });
    const ctx = await blendContext(items.map((i) => i.partNumber));
    for (let start = 0; start < items.length; start += BATCH) {
      const batch = items.slice(start, start + BATCH);
      const [rates, prev] = await Promise.all([
        ratesForItems(batch.filter((i) => i.status === "OK").map((i) => i.id)),
        prisma.salsifyPush.findMany({ where: { partNumber: { in: batch.map((i) => i.partNumber) } } }),
      ]);
      const last = new Map(prev.map((p) => [p.partNumber, p.cost != null && p.note != null && p.pushedAt ? { cost: p.cost, note: p.note } : null]));
      const toWrite: { partNumber: string; value: PushValue }[] = [];
      for (const i of batch) {
        const value = i.status === "OK" ? pushValue(summaryOf(blendFor(ctx, i.partNumber, rates.get(i.id) ?? [], i.upsBillable == null ? null : Number(i.upsBillable))), s.origins) : null;
        if (!value) {
          counts.skipped++;
          counts.done++;
          problem(i.partNumber, i.status === "OK" ? "No zone could be priced, so there's no cost" : `Not quoted: ${i.error ?? i.status}`);
        } else if (!isChanged(last.get(i.partNumber), value)) {
          counts.unchanged++;
          counts.done++;
        } else toWrite.push({ partNumber: i.partNumber, value });
      }
      let next = 0;
      const worker = async () => {
        while (!stopped && next < toWrite.length) {
          const { partNumber, value } = toWrite[next++];
          try {
            await updateSalsifyProduct(key, s.salsify.orgId, partNumber, s.salsifyPush.property, pushValues(value, day));
            await prisma.salsifyPush.upsert({ where: { partNumber }, create: { partNumber, ...value, pushedAt: new Date() }, update: { ...value, pushedAt: new Date(), lastError: null, lastErrorAt: null } });
            counts.written++;
            if (writtenSample.length < 20) writtenSample.push({ partNumber, ...value });
          } catch (err) {
            const reason = errorMessage(err).slice(0, 300);
            counts.failed++;
            problem(partNumber, reason);
            if (/can't edit|rejected your API key/.test(reason)) authFailures++;
            await prisma.salsifyPush.upsert({ where: { partNumber }, create: { partNumber, lastError: reason, lastErrorAt: new Date() }, update: { lastError: reason, lastErrorAt: new Date() } });
          }
          counts.done++;
          if (counts.done % 20 === 0) await save();
          // a key without edit rights fails every product: stop instead of trying them all
          if (authFailures >= 5 && counts.written === 0) stopped = true;
          await new Promise((r) => setTimeout(r, PAUSE_MS));
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      if (stopped) throw new Error(`Stopped: ${reasonOf(problems) ?? "the Salsify key can't edit products"}`);
    }
    const status = counts.failed > 0 && counts.written === 0 && counts.unchanged === 0 ? "FAILED" : "READY";
    await prisma.salsifyPushRun.update({ where: { id: runId }, data: { ...counts, problems, status, finishedAt: new Date(), error: status === "FAILED" ? `No product could be written, e.g. ${reasonOf(problems)}` : null } });
    await audit(`shipping.salsify_push_${status.toLowerCase()}`, status === "READY", { ...counts, property: s.salsifyPush.property, written: writtenSample });
  } catch (err) {
    await prisma.salsifyPushRun.update({ where: { id: runId }, data: { ...counts, problems, status: "FAILED", error: errorMessage(err).slice(0, 500), finishedAt: new Date() } });
    await audit("shipping.salsify_push_failed", false, { ...counts, error: errorMessage(err) });
  }
}

const reasonOf = (p: PushProblem[]) => p.find((x) => !x.reason.startsWith("Not quoted") && !x.reason.startsWith("No zone"))?.reason ?? null;

export async function salsifyPushStatus() {
  const [last, s] = await Promise.all([prisma.salsifyPushRun.findFirst({ orderBy: { createdAt: "desc" } }), getSetting("shippingRates")]);
  return {
    property: s.salsifyPush.property,
    enabled: s.salsifyPush.enabled,
    last: last
      ? {
          status: last.status,
          products: last.products,
          done: last.done,
          written: last.written,
          unchanged: last.unchanged,
          skipped: last.skipped,
          failed: last.failed,
          problems: (last.problems ?? []) as PushProblem[],
          error: last.error,
          startedBy: last.startedBy,
          property: last.property,
          createdAt: last.createdAt.toISOString(),
          finishedAt: last.finishedAt?.toISOString() ?? null,
        }
      : null,
  };
}
export type SalsifyPushStatus = Awaited<ReturnType<typeof salsifyPushStatus>>;

/** Describes the Settings test: the property, and what would be written for one product. */
export async function testSalsifyPush(s: ShippingRatesSettings, actor: Actor, partNumber: string) {
  if (!s.salsifyPush.property) throw new Error("Enter the Salsify property first.");
  const { key } = await resolveKey(s, actor);
  const { prop, error, warnings } = await checkProperty(s, key);
  if (!prop) throw new Error(error!);
  const { value, reason, runMode } = await valueFor(s, partNumber);
  const parts = [`Salsify property "${prop.id}"${prop.dataType ? ` (${prop.dataType}${prop.multiValued ? ", multiple values" : ""})` : ""} found.`];
  if (error || warnings.length) parts.push(`Check it: ${[error, ...warnings].filter(Boolean).join("; ")}`);
  if (value) parts.push(`${partNumber} would get: ${pushValues(value, usageDay()).map((v) => `"${v}"`).join(", ")}${runMode !== "live" ? " (from simulated prices, which are never pushed)" : ""}.`);
  else parts.push(`${partNumber}: ${reason}`);
  // what would stop "Write this one product" (null = ready); the button still works and gives the same reason
  const writeBlocker = (await pushBlocker(s)) ?? error ?? (value ? null : reason);
  return { ok: !error && warnings.length === 0, message: parts.join(" "), writeBlocker };
}

/** Called every hour on the hour by the app scheduler. */
export async function runScheduledSalsifyPush(at = new Date()) {
  const s = await getSetting("shippingRates");
  if (!isDue(s.salsifyPush, at)) return;
  try {
    await (await startSalsifyPush(PUSH_ACTOR)).finished;
  } catch (err) {
    await logAudit({ action: "shipping.salsify_push_skipped", category: "TOOL", actorEmail: PUSH_ACTOR.email, success: false, metadata: { reason: errorMessage(err) }, ip: null, userAgent: null });
  }
}
