import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting, type PackagingSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/api";
import { iterateSalsifyRecords, plainValue, updateSalsifyProperties } from "@/lib/salsify";
import { getUserSecret } from "@/lib/user-credentials";
import { isDue } from "@/lib/timezone";
import { loadMethods, loadPackaging, salsifyOrg, toProduct } from "@/lib/packaging/data";
import { analyzeCatalog, type CatalogReport, type ProductResult } from "@/lib/packaging/report";
import type { Product } from "@/lib/packaging/engine";

// Background jobs: read the product list from Salsify (sync), check every product against the packaging
// (analysis), and write each product's calculated shipping size and weight back to Salsify (push).

type Actor = { id: string | null; email: string };
export const PACKAGING_SCHEDULE_ACTOR = { id: null, email: "packaging schedule" } as const;
const KEEP_ANALYSES = 5;
const KEEP_RUNS = 20;

function audit(actor: Actor, action: string, success: boolean, targetType: string, targetId: string, metadata: Record<string, unknown>) {
  return logAudit({ action, category: "TOOL", actorId: actor.id, actorEmail: actor.email, success, targetType, targetId, metadata, ip: null, userAgent: null });
}

/** The Salsify key a job uses: the person's own when they start it, else the user chosen in Settings. */
export async function resolvePackagingKey(s: PackagingSettings, actor: Actor) {
  if (actor.id) {
    const own = await getUserSecret(actor.id, "salsify");
    if (own) return { key: own, owner: actor.email };
  }
  const keyUserId = s.salsify.keyUserId;
  if (!keyUserId) throw new Error(actor.id ? "Add your Salsify API key in My Profile, or choose whose key scheduled jobs use in Settings → Salsify." : "No user is chosen for scheduled Salsify jobs (Settings → Salsify).");
  const key = await getUserSecret(keyUserId, "salsify");
  if (!key) throw new Error("The user chosen for scheduled Salsify jobs no longer has a saved Salsify key.");
  const owner = (await prisma.user.findUnique({ where: { id: keyUserId }, select: { email: true } }))?.email ?? "chosen user";
  return { key, owner };
}

// ─── Reading a Salsify record ────────────────────────────────────────────────

function num(v: unknown): number | null {
  const s = plainValue(v);
  if (s == null) return null;
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
const bool = (v: unknown) => ["1", "true", "yes", "y", "x"].includes((plainValue(v) ?? "").toLowerCase());

export type MappedProduct = {
  partNumber: string;
  name: string;
  height: number | null;
  width: number | null;
  length: number | null;
  weight: number | null;
  upc: string | null;
  foldable: boolean;
  shipsOwn: boolean;
  /** How it ships today (optional; all four or none). */
  packedHeight: number | null;
  packedWidth: number | null;
  packedLength: number | null;
  packedWeight: number | null;
  error: string | null;
};

/** A Salsify record in the tool's own fields. Missing size or weight is kept, with what's missing. */
export function mapPackagingProduct(id: string, record: Record<string, unknown>, f: PackagingSettings["salsify"]["fields"]): MappedProduct {
  const size = { height: num(record[f.height]), width: num(record[f.width]), length: num(record[f.length]), weight: num(record[f.weight]) };
  const missing = (["length", "width", "height", "weight"] as const).filter((k) => size[k] == null);
  const read = (field: string) => (field ? num(record[field]) : null);
  const packed = { packedHeight: read(f.packedHeight), packedWidth: read(f.packedWidth), packedLength: read(f.packedLength), packedWeight: read(f.packedWeight) };
  // a partial packaged size can't be compared: keep all four or none
  const packedComplete = Object.values(packed).every((v) => v != null);
  return {
    partNumber: id,
    name: plainValue(record[f.name]) ?? id,
    ...size,
    upc: f.upc ? plainValue(record[f.upc]) : null,
    foldable: f.foldable ? bool(record[f.foldable]) : false,
    shipsOwn: f.shipsOwn ? bool(record[f.shipsOwn]) : false,
    ...(packedComplete ? packed : { packedHeight: null, packedWidth: null, packedLength: null, packedWeight: null }),
    error: missing.length ? `Salsify has no ${missing.join(", ")} (fields "${missing.map((k) => f[k]).join('", "')}")` : null,
  };
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export async function startSync(actor: Actor) {
  const busy = await prisma.packSyncRun.findFirst({ where: { status: { in: ["PENDING", "RUNNING"] } } });
  if (busy) throw new Error("A Salsify sync is already running.");
  const s = await getSetting("packagingConfigurator");
  if (!s.salsify.listId) throw new Error("Set the Salsify list in Settings → Salsify first.");
  const orgId = await salsifyOrg(s);
  if (!orgId) throw new Error("The Salsify organization ID isn't set (Settings → Salsify).");
  const { key, owner } = await resolvePackagingKey(s, actor);
  const run = await prisma.packSyncRun.create({ data: { status: "RUNNING", startedById: actor.id, startedBy: actor.email, listId: s.salsify.listId } });
  await audit(actor, "packaging.sync_started", true, "PackSyncRun", run.id, { listId: s.salsify.listId, salsifyKeyOf: owner });
  const finished = executeSync(run.id, s, orgId, key, actor);
  return { run, finished };
}

async function executeSync(runId: string, s: PackagingSettings, orgId: string, key: string, actor: Actor) {
  const seen = new Set<string>();
  let done = 0, created = 0, updated = 0, incomplete = 0;
  try {
    const existing = new Set((await prisma.packProduct.findMany({ select: { partNumber: true } })).map((p) => p.partNumber));
    for await (const page of iterateSalsifyRecords(key, orgId, s.salsify.listId, { pageSize: 100 })) {
      const cur = await prisma.packSyncRun.findUnique({ where: { id: runId }, select: { status: true } });
      if (cur?.status === "CANCELLED") {
        await prisma.packSyncRun.update({ where: { id: runId }, data: { finishedAt: new Date(), done, created, updated, incomplete } });
        await audit(actor, "packaging.sync_cancelled", true, "PackSyncRun", runId, { done });
        return;
      }
      const syncedAt = new Date();
      await prisma.$transaction(
        page.records.map(({ id, record }) => {
          const p = mapPackagingProduct(id, record, s.salsify.fields);
          seen.add(p.partNumber);
          if (p.error) incomplete++;
          if (existing.has(p.partNumber)) updated++;
          else created++;
          const data = { name: p.name, height: p.height, width: p.width, length: p.length, weight: p.weight, upc: p.upc, foldable: p.foldable, shipsOwn: p.shipsOwn, packedHeight: p.packedHeight, packedWidth: p.packedWidth, packedLength: p.packedLength, packedWeight: p.packedWeight, error: p.error, syncedAt };
          return prisma.packProduct.upsert({ where: { partNumber: p.partNumber }, create: { partNumber: p.partNumber, ...data }, update: data });
        }),
      );
      done += page.records.length;
      await prisma.packSyncRun.update({ where: { id: runId }, data: { done, created, updated, incomplete, ...(page.total != null ? { total: page.total } : {}) } });
    }
    // the list was read to the end: products no longer on it go
    const gone = [...existing].filter((p) => !seen.has(p));
    for (let i = 0; i < gone.length; i += 1000) await prisma.packProduct.deleteMany({ where: { partNumber: { in: gone.slice(i, i + 1000) } } });
    await prisma.packSyncRun.update({ where: { id: runId }, data: { status: "READY", total: done, removed: gone.length, finishedAt: new Date() } });
    await audit(actor, "packaging.sync_ready", true, "PackSyncRun", runId, { products: done, created, updated, removed: gone.length, incomplete });
    await pruneRuns();
    void analyseThenPush(actor).catch((err) => console.error("[packaging] analysis after sync:", errorMessage(err)));
  } catch (err) {
    // keep what was read; nothing is removed after a partial read
    const msg = done ? `Salsify stopped answering after ${done.toLocaleString("en-US")} products: ${errorMessage(err)}` : errorMessage(err);
    await prisma.packSyncRun.update({ where: { id: runId }, data: { status: "FAILED", error: msg.slice(0, 500), done, created, updated, incomplete, finishedAt: new Date() } });
    await audit(actor, "packaging.sync_failed", false, "PackSyncRun", runId, { error: errorMessage(err), done });
  }
}

/**
 * After a sync: the analysis, then (for a scheduled sync with "push right after each sync" on) the push, so
 * one schedule reads Salsify, finds each product's best fit and writes it back.
 */
async function analyseThenPush(actor: Actor) {
  const analysis = await startAnalysis(actor, "after-sync");
  await analysis.finished;
  const s = await getSetting("packagingConfigurator");
  if (actor.id !== PACKAGING_SCHEDULE_ACTOR.id || actor.email !== PACKAGING_SCHEDULE_ACTOR.email || !s.push.afterSync) return;
  try {
    await (await startPush(actor)).finished;
  } catch (err) {
    await logAudit({ action: "packaging.push_after_sync", category: "TOOL", actorEmail: actor.email, success: false, metadata: { error: errorMessage(err) }, ip: null, userAgent: null });
  }
}

export async function cancelSync(actor: Actor) {
  const run = await prisma.packSyncRun.findFirst({ where: { status: { in: ["PENDING", "RUNNING"] } } });
  if (!run) return null;
  await prisma.packSyncRun.update({ where: { id: run.id }, data: { status: "CANCELLED" } });
  await audit(actor, "packaging.sync_cancel_requested", true, "PackSyncRun", run.id, {});
  return run.id;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

/** Products the analysis can check (complete size and weight). */
export async function analysableProducts(): Promise<{ products: Product[]; incomplete: number }> {
  const rows = await prisma.packProduct.findMany({ orderBy: { partNumber: "asc" } });
  const products = rows.map(toProduct).filter((p): p is Product => p != null);
  return { products, incomplete: rows.length - products.length };
}

export type StoredReport = CatalogReport & { incomplete: number };

export async function startAnalysis(actor: Actor, trigger: "manual" | "after-sync" | "after-change") {
  const busy = await prisma.packAnalysisRun.findFirst({ where: { status: { in: ["PENDING", "RUNNING"] } } });
  if (busy) {
    // one at a time; a change made during a run gets its own run afterwards
    if (trigger !== "manual") pendingAgain = true;
    return { run: busy, finished: Promise.resolve() };
  }
  const run = await prisma.packAnalysisRun.create({ data: { status: "RUNNING", startedById: actor.id, startedBy: actor.email, trigger } });
  const finished = executeAnalysis(run.id, actor, trigger);
  return { run, finished };
}

let pendingAgain = false;

async function executeAnalysis(runId: string, actor: Actor, trigger: string) {
  try {
    const [s, packaging, methods, { products, incomplete }] = await Promise.all([getSetting("packagingConfigurator"), loadPackaging(), loadMethods(), analysableProducts()]);
    await prisma.packAnalysisRun.update({ where: { id: runId }, data: { products: products.length } });
    const report = await analyzeCatalog(products, packaging, methods, s.engine, async (done) => {
      await prisma.packAnalysisRun.update({ where: { id: runId }, data: { done } });
      await new Promise((r) => setImmediate(r));
    });
    const stored: StoredReport = { ...report, incomplete };
    await prisma.packAnalysisRun.update({ where: { id: runId }, data: { status: "READY", done: products.length, report: stored as unknown as Prisma.InputJsonValue, finishedAt: new Date() } });
    if (trigger !== "after-change") await audit(actor, "packaging.analysis_ready", true, "PackAnalysisRun", runId, { trigger, products: products.length, covered: report.covered, noFit: report.noFit, dimExposed: report.dimExposed });
    const old = await prisma.packAnalysisRun.findMany({ where: { status: { notIn: ["PENDING", "RUNNING"] } }, orderBy: { createdAt: "desc" }, skip: KEEP_ANALYSES, select: { id: true } });
    if (old.length) await prisma.packAnalysisRun.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
  } catch (err) {
    await prisma.packAnalysisRun.update({ where: { id: runId }, data: { status: "FAILED", error: errorMessage(err).slice(0, 500), finishedAt: new Date() } });
    await audit(actor, "packaging.analysis_failed", false, "PackAnalysisRun", runId, { trigger, error: errorMessage(err) });
  } finally {
    if (pendingAgain) {
      pendingAgain = false;
      void startAnalysis(actor, "after-change").catch(() => {});
    }
  }
}

const g = globalThis as unknown as { __packAnalysisTimer?: ReturnType<typeof setTimeout> };
/** After packaging, shipping methods or fit rules change: re-run the analysis shortly (changes in a burst run it once). */
export function refreshAnalysisSoon(actor: Actor, delayMs = 5_000) {
  if (g.__packAnalysisTimer) clearTimeout(g.__packAnalysisTimer);
  g.__packAnalysisTimer = setTimeout(() => {
    g.__packAnalysisTimer = undefined;
    void startAnalysis(actor, "after-change").catch((err) => console.error("[packaging] analysis after change:", errorMessage(err)));
  }, delayMs);
}

/** The newest finished analysis (with its report). */
export async function latestReport() {
  const run = await prisma.packAnalysisRun.findFirst({ where: { status: "READY" }, orderBy: { createdAt: "desc" } });
  return run ? { run, report: run.report as unknown as StoredReport } : null;
}

// ─── Push to Salsify ─────────────────────────────────────────────────────────

export type PushValues = { length: string; width: string; height: string; weight: string };
const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** What's written for a product: its best packaging's sealed size and actual weight (product + packaging). Null when nothing fits. */
export function pushValuesFor(r: ProductResult): PushValues | null {
  if (!r.shippedDims) return null;
  // the actual shipping weight (products + packaging), not the billed (DIM, rounded-up) weight
  return { length: fmt(r.shippedDims.length), width: fmt(r.shippedDims.width), height: fmt(r.shippedDims.height), weight: fmt(r.actualWeight) };
}
export const pushBody = (s: PackagingSettings, v: PushValues) => Object.fromEntries((["length", "width", "height", "weight"] as const).map((k) => [s.push.properties[k], v[k]]));
/** Field by field: stored JSON comes back with its keys in a different order. */
const sameValues = (a: unknown, b: PushValues) => !!a && typeof a === "object" && (["length", "width", "height", "weight"] as const).every((k) => (a as Record<string, unknown>)[k] === b[k]);

export async function pushBlocker(s: PackagingSettings) {
  if ((["length", "width", "height", "weight"] as const).some((k) => !s.push.properties[k])) return "Set the four Salsify properties in Settings → Push to Salsify first.";
  if (!(await salsifyOrg(s))) return "The Salsify organization ID isn't set (Settings → Salsify).";
  if (!(await latestReport())) return "There's no finished packaging analysis yet; run a sync or the report first.";
  return null;
}

export async function startPush(actor: Actor) {
  const busy = await prisma.packPushRun.findFirst({ where: { status: { in: ["PENDING", "RUNNING"] } } });
  if (busy) throw new Error("A push to Salsify is already running.");
  const s = await getSetting("packagingConfigurator");
  const blocker = await pushBlocker(s);
  if (blocker) throw new Error(blocker);
  const { key, owner } = await resolvePackagingKey(s, actor);
  const latest = (await latestReport())!;
  const run = await prisma.packPushRun.create({ data: { status: "RUNNING", startedById: actor.id, startedBy: actor.email, analysisRunId: latest.run.id, products: latest.report.results.length } });
  await audit(actor, "packaging.push_started", true, "PackPushRun", run.id, { products: latest.report.results.length, salsifyKeyOf: owner, properties: s.push.properties });
  const finished = executePush(run.id, s, await salsifyOrg(s), key, latest.report.results, actor);
  return { run, finished };
}

async function executePush(runId: string, s: PackagingSettings, orgId: string, key: string, results: ProductResult[], actor: Actor) {
  const counts = { done: 0, written: 0, unchanged: 0, skipped: 0, failed: 0, manual: 0 };
  const problems: { partNumber: string; reason: string }[] = [];
  const note = (partNumber: string, reason: string) => problems.length < 200 && problems.push({ partNumber, reason });
  try {
    const prev = new Map((await prisma.packPush.findMany()).map((p) => [p.partNumber, p]));
    for (const r of results) {
      if (counts.done % 25 === 0) {
        const cur = await prisma.packPushRun.findUnique({ where: { id: runId }, select: { status: true } });
        if (cur?.status === "CANCELLED") {
          await prisma.packPushRun.update({ where: { id: runId }, data: { ...counts, problems, finishedAt: new Date() } });
          await audit(actor, "packaging.push_cancelled", true, "PackPushRun", runId, counts);
          return;
        }
        await prisma.packPushRun.update({ where: { id: runId }, data: { ...counts, problems } });
      }
      counts.done++;
      // a packaging chosen by hand in the Configurator stays until someone returns it to automatic
      if (prev.get(r.partNumber)?.manual) {
        counts.manual++;
        continue;
      }
      const values = pushValuesFor(r);
      if (!values) {
        counts.skipped++;
        note(r.partNumber, "No packaging fits it, so there's no shipping size");
        continue;
      }
      const last = prev.get(r.partNumber);
      if (last?.pushedAt && sameValues(last.values, values)) {
        counts.unchanged++;
        continue;
      }
      try {
        await updateSalsifyProperties(key, orgId, r.partNumber, pushBody(s, values));
        await prisma.packPush.upsert({ where: { partNumber: r.partNumber }, create: { partNumber: r.partNumber, values, pushedAt: new Date() }, update: { values, pushedAt: new Date(), lastError: null, lastErrorAt: null } });
        counts.written++;
      } catch (err) {
        counts.failed++;
        note(r.partNumber, errorMessage(err));
        await prisma.packPush.upsert({ where: { partNumber: r.partNumber }, create: { partNumber: r.partNumber, lastError: errorMessage(err).slice(0, 500), lastErrorAt: new Date() }, update: { lastError: errorMessage(err).slice(0, 500), lastErrorAt: new Date() } });
        // a key that can't write anything stops the run instead of failing every product
        if (counts.written === 0 && counts.failed >= 5 && /can't edit|rejected your API key|doesn't have access/.test(errorMessage(err))) throw err;
      }
    }
    const status = counts.failed > 0 && counts.written === 0 && counts.unchanged === 0 ? "FAILED" : "READY";
    await prisma.packPushRun.update({ where: { id: runId }, data: { ...counts, problems, status, finishedAt: new Date(), error: status === "FAILED" ? "Nothing could be written; see the problems listed." : null } });
    await audit(actor, `packaging.push_${status.toLowerCase()}`, status === "READY", "PackPushRun", runId, counts);
    await pruneRuns();
  } catch (err) {
    await prisma.packPushRun.update({ where: { id: runId }, data: { ...counts, problems, status: "FAILED", error: errorMessage(err).slice(0, 500), finishedAt: new Date() } });
    await audit(actor, "packaging.push_failed", false, "PackPushRun", runId, { ...counts, error: errorMessage(err) });
  }
}

export async function cancelPush(actor: Actor) {
  const run = await prisma.packPushRun.findFirst({ where: { status: { in: ["PENDING", "RUNNING"] } } });
  if (!run) return null;
  await prisma.packPushRun.update({ where: { id: run.id }, data: { status: "CANCELLED" } });
  await audit(actor, "packaging.push_cancel_requested", true, "PackPushRun", run.id, {});
  return run.id;
}

async function pruneRuns() {
  for (const model of [prisma.packSyncRun, prisma.packPushRun] as const) {
    const m = model as unknown as { findMany: typeof prisma.packSyncRun.findMany; deleteMany: typeof prisma.packSyncRun.deleteMany };
    const old = await m.findMany({ where: { status: { notIn: ["PENDING", "RUNNING"] } }, orderBy: { createdAt: "desc" }, skip: KEEP_RUNS, select: { id: true } });
    if (old.length) await m.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
  }
}

// ─── Status and schedule ─────────────────────────────────────────────────────

/** Jobs left RUNNING by a restart can't finish: mark them failed (called at startup). */
export async function markInterruptedPackagingJobs() {
  const data = { status: "FAILED" as const, error: "Stopped when the portal restarted", finishedAt: new Date() };
  await prisma.packSyncRun.updateMany({ where: { status: { in: ["PENDING", "RUNNING"] } }, data });
  await prisma.packAnalysisRun.updateMany({ where: { status: { in: ["PENDING", "RUNNING"] } }, data });
  await prisma.packPushRun.updateMany({ where: { status: { in: ["PENDING", "RUNNING"] } }, data });
}

/** Called every hour on the hour by the app scheduler. */
export async function runScheduledPackaging(at = new Date()) {
  const s = await getSetting("packagingConfigurator");
  if (isDue(s.sync, at)) {
    try {
      await startSync(PACKAGING_SCHEDULE_ACTOR);
    } catch (err) {
      await logAudit({ action: "packaging.sync_scheduled", category: "TOOL", actorEmail: PACKAGING_SCHEDULE_ACTOR.email, success: false, metadata: { error: errorMessage(err) }, ip: null, userAgent: null });
    }
  }
  if (isDue(s.push, at)) {
    try {
      await startPush(PACKAGING_SCHEDULE_ACTOR);
    } catch (err) {
      await logAudit({ action: "packaging.push_scheduled", category: "TOOL", actorEmail: PACKAGING_SCHEDULE_ACTOR.email, success: false, metadata: { error: errorMessage(err) }, ip: null, userAgent: null });
    }
  }
}

/** The tool's job status for the Report and Settings pages. */
export async function jobStatus() {
  const pick = { orderBy: { createdAt: "desc" as const } };
  const [sync, analysis, push, products, incomplete] = await Promise.all([
    prisma.packSyncRun.findFirst(pick),
    prisma.packAnalysisRun.findFirst({ ...pick, select: { id: true, status: true, trigger: true, products: true, done: true, error: true, createdAt: true, finishedAt: true, startedBy: true } }),
    prisma.packPushRun.findFirst(pick),
    prisma.packProduct.count(),
    prisma.packProduct.count({ where: { error: { not: null } } }),
  ]);
  const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
  return {
    products,
    incomplete,
    sync: sync && { id: sync.id, status: sync.status, startedBy: sync.startedBy, total: sync.total, done: sync.done, created: sync.created, updated: sync.updated, removed: sync.removed, incomplete: sync.incomplete, error: sync.error, createdAt: iso(sync.createdAt)!, finishedAt: iso(sync.finishedAt) },
    analysis: analysis && { id: analysis.id, status: analysis.status, trigger: analysis.trigger, startedBy: analysis.startedBy, products: analysis.products, done: analysis.done, error: analysis.error, createdAt: iso(analysis.createdAt)!, finishedAt: iso(analysis.finishedAt) },
    push: push && { id: push.id, status: push.status, startedBy: push.startedBy, products: push.products, done: push.done, written: push.written, unchanged: push.unchanged, skipped: push.skipped, failed: push.failed, manual: push.manual, problems: push.problems as { partNumber: string; reason: string }[], error: push.error, createdAt: iso(push.createdAt)!, finishedAt: iso(push.finishedAt) },
  };
}
export type PackagingJobStatus = Awaited<ReturnType<typeof jobStatus>>;
