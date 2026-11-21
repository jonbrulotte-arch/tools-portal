import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getSetting, type AutoEmailSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/api";
import { sendGraphMail, type GraphConfig } from "@/lib/graph-mail";
import { runQuery, type SqlColumn, type SqlValue } from "@/lib/auto-emails/sql";
import { buildEmail, keyOf, resolveKeyColumns } from "@/lib/auto-emails/render";

// Runs automated emails: query → drop rows already sent (by key columns) → email the new rows →
// record their keys. Keys are recorded only after Graph accepts the email, so a failed send is retried
// on the next run. Checks with nothing new only update lastCheckedAt (the log holds sends and failures).

export type Trigger = "SCHEDULE" | "MANUAL" | "TEST";
type Actor = { id: string | null; email: string };
/** Most rows read from one query run (every row is checked against what was already sent). */
export const QUERY_ROW_LIMIT = 20_000;
export const SCHEDULE_ACTOR: Actor = { id: null, email: "auto-emails schedule" };

export function graphConfigFrom(s: AutoEmailSettings): GraphConfig {
  const g = s.graph;
  if (!g.encTenantId || !g.encClientId || !g.encClientSecret || !g.senderAddress) throw new Error("Microsoft Graph isn't set up for Automated Emails (Settings → Microsoft Graph).");
  return { tenantId: decrypt(g.encTenantId), clientId: decrypt(g.encClientId), clientSecret: decrypt(g.encClientSecret), senderAddress: g.senderAddress, senderName: g.senderName };
}

/** Rows whose key hasn't been sent for this email (first occurrence only), with their keys. */
export async function newRows(emailId: string | null, columns: SqlColumn[], rows: Record<string, SqlValue>[], keyColumns: string[]) {
  const keys = resolveKeyColumns(columns, keyColumns);
  const seen = new Set<string>();
  const keyed = [];
  for (const row of rows) {
    const k = keyOf(row, keys);
    if (seen.has(k.hash)) continue;
    seen.add(k.hash);
    keyed.push({ row, key: k });
  }
  const already = emailId && keyed.length ? new Set((await prisma.autoEmailSentKey.findMany({ where: { emailId, keyHash: { in: keyed.map((k) => k.key.hash) } }, select: { keyHash: true } })).map((r) => r.keyHash)) : new Set<string>();
  return { fresh: keyed.filter((k) => !already.has(k.key.hash)), alreadySent: keyed.filter((k) => already.has(k.key.hash)).length };
}

export type RunResult = { status: "sent" | "nothing-new" | "failed"; rowCount: number; logId: string | null; error: string | null; more: boolean };

/**
 * Checks one automated email and sends its new rows.
 * TEST sends go only to `testTo`, never record keys, and show sample rows when nothing is new.
 */
export async function runAutoEmail(id: string, trigger: Trigger, actor: Actor = SCHEDULE_ACTOR, testTo?: string): Promise<RunResult> {
  const email = await prisma.autoEmail.findUnique({ where: { id } });
  if (!email) throw new Error("Automated email not found");
  const s = await getSetting("autoEmails");
  const started = Date.now();
  const to = trigger === "TEST" ? [testTo ?? actor.email] : email.to;
  const cc = trigger === "TEST" ? [] : email.cc;
  let subject = email.subject;
  let html: string | null = null;
  let picked: { row: Record<string, SqlValue>; key: { hash: string; text: string } }[] = [];
  const auditMeta = (extra: Record<string, unknown>) => ({ emailId: id, name: email.name, trigger, ...extra });
  const ipless = actor.id ? {} : { ip: null, userAgent: null };
  try {
    if (trigger !== "TEST" && !to.length) throw new Error("This email has no 'To' recipients.");
    const result = await runQuery(s.sql, email.sqlQuery, QUERY_ROW_LIMIT);
    // never silently miss new rows past the read limit
    if (result.truncated) throw new Error(`The query returned more than ${QUERY_ROW_LIMIT.toLocaleString("en-US")} rows. Narrow its date range or filters.`);
    const { fresh } = await newRows(trigger === "TEST" ? null : email.id, result.columns, result.rows, email.keyColumns);
    let rows = fresh;
    if (trigger === "TEST" && !rows.length) rows = (await newRows(null, result.columns, result.rows, email.keyColumns)).fresh;
    if (!rows.length) {
      if (trigger !== "TEST") await prisma.autoEmail.update({ where: { id }, data: { lastCheckedAt: new Date(), lastStatus: "nothing-new", lastError: null } });
      return { status: "nothing-new", rowCount: 0, logId: null, error: null, more: false };
    }
    picked = rows.slice(0, s.maxRowsPerEmail);
    const built = buildEmail(email, result.columns, picked.map((p) => p.row), new Date(), s);
    subject = trigger === "TEST" ? `[TEST] ${built.subject}` : built.subject;
    html = built.html;
    await sendGraphMail(graphConfigFrom(s), { to: to.map((e) => ({ email: e })), cc: cc.map((e) => ({ email: e })), subject, html });

    const log = await prisma.autoEmailLog.create({
      data: { emailId: id, emailName: email.name, trigger, status: "SENT", to, cc, subject, rowCount: picked.length, keys: picked.map((p) => p.key.text), html, durationMs: Date.now() - started, actorEmail: actor.email },
    });
    if (trigger !== "TEST") {
      await prisma.autoEmailSentKey.createMany({ data: picked.map((p) => ({ emailId: id, keyHash: p.key.hash, keyText: p.key.text, logId: log.id })), skipDuplicates: true });
      await prisma.autoEmail.update({ where: { id }, data: { lastCheckedAt: new Date(), lastSentAt: new Date(), lastStatus: "sent", lastError: null } });
    }
    await logAudit({ action: trigger === "TEST" ? "auto_email.test_sent" : "auto_email.sent", category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: "AutoEmail", targetId: id, metadata: auditMeta({ rows: picked.length, to, cc }), ...ipless });
    return { status: "sent", rowCount: picked.length, logId: log.id, error: null, more: rows.length > picked.length };
  } catch (err) {
    const error = errorMessage(err).slice(0, 2000);
    const log = await prisma.autoEmailLog.create({
      data: { emailId: id, emailName: email.name, trigger, status: "FAILED", to, cc, subject, rowCount: picked.length, keys: picked.length ? picked.map((p) => p.key.text) : undefined, html, error, durationMs: Date.now() - started, actorEmail: actor.email },
    });
    if (trigger !== "TEST") await prisma.autoEmail.update({ where: { id }, data: { lastCheckedAt: new Date(), lastStatus: "failed", lastError: error } });
    await logAudit({ action: "auto_email.failed", category: "TOOL", actorId: actor.id, actorEmail: actor.email, success: false, targetType: "AutoEmail", targetId: id, metadata: auditMeta({ error }), ...ipless });
    return { status: "failed", rowCount: 0, logId: log.id, error, more: false };
  }
}

const g = globalThis as unknown as { __autoEmailsRunning?: boolean };

/** Checks every enabled automated email, one at a time (never overlapping). */
export async function runAllAutoEmails() {
  if (g.__autoEmailsRunning) return { skipped: true, results: [] as RunResult[] };
  g.__autoEmailsRunning = true;
  try {
    const emails = await prisma.autoEmail.findMany({ where: { enabled: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
    const results: RunResult[] = [];
    for (const e of emails) results.push(await runAutoEmail(e.id, "SCHEDULE"));
    return { skipped: false, results };
  } finally {
    g.__autoEmailsRunning = false;
  }
}

/** Called every 5 minutes by the app scheduler; runs on the configured interval (5/15/30/60). */
export async function runScheduledAutoEmails(now = new Date()) {
  const s = await getSetting("autoEmails");
  if (s.enabled && now.getUTCMinutes() % s.intervalMinutes === 0) await runAllAutoEmails();
  // once a day: forget keys and log entries past their retention
  if (now.getUTCHours() === 10 && now.getUTCMinutes() === 0) await pruneAutoEmails(s);
}

export async function pruneAutoEmails(s: AutoEmailSettings, now = new Date()) {
  const day = 86_400_000;
  const keys = await prisma.autoEmailSentKey.deleteMany({ where: { sentAt: { lt: new Date(now.getTime() - s.keyRetentionDays * day) } } });
  const logs = await prisma.autoEmailLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - s.logRetentionDays * day) } } });
  if (keys.count || logs.count) await logAudit({ action: "auto_email.pruned", category: "TOOL", actorEmail: SCHEDULE_ACTOR.email, metadata: { keys: keys.count, logs: logs.count }, ip: null, userAgent: null });
  return { keys: keys.count, logs: logs.count };
}
