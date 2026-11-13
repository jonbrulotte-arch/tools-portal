import { prisma } from "@/lib/prisma";
import { getSetting, type ShippingSchedule } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/api";
import { retryFailedQuotes, startQuoteRun } from "@/lib/shipping/runner";
import { zonedParts } from "@/lib/timezone";

// Scheduled quote run: checked hourly by the app scheduler (src/lib/scheduler.ts). Runs weekly (on the
// chosen day) or daily, at the configured hour in the configured time zone (the server clock is UTC),
// re-quotes failures once, and prunes old scheduled runs. Manual runs are never pruned.

export const SCHEDULE_ACTOR = { id: null, email: "quote schedule" } as const;
/** Earlier name for scheduled runs, still pruned with them. */
const OLD_SCHEDULE_ACTORS = ["nightly schedule"];

export { TIMEZONES as SCHEDULE_TIMEZONES, zonedParts } from "@/lib/timezone";

export function isDue(s: ShippingSchedule, at: Date) {
  if (!s.enabled) return false;
  const p = zonedParts(at, s.timezone);
  return p.hour === s.hour && (s.frequency === "daily" || p.weekday === s.weekday);
}

/** The next time the schedule fires (top of the hour), for display. */
export function nextRun(s: ShippingSchedule, from: Date): Date | null {
  if (!s.enabled) return null;
  const t = new Date(from);
  t.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 24 * 8 + 1; i++) {
    t.setUTCHours(t.getUTCHours() + 1);
    if (isDue(s, t)) return new Date(t);
  }
  return null;
}

const audit = (action: string, success: boolean, metadata: Record<string, unknown>, targetId?: string) =>
  logAudit({ action, category: "TOOL", actorEmail: SCHEDULE_ACTOR.email, success, targetType: targetId ? "ShippingQuoteRun" : undefined, targetId, metadata, ip: null, userAgent: null });

/** Called every hour on the hour. */
export async function runScheduledQuotes(at = new Date()) {
  const s = await getSetting("shippingRates");
  if (!isDue(s.schedule, at)) return;
  if (s.mode !== "live") return audit("shipping.scheduled_run_skipped", true, { reason: "The tool is in simulated mode" });
  try {
    const { run, finished } = await startQuoteRun(SCHEDULE_ACTOR);
    await audit("shipping.scheduled_run_started", true, { total: run.total }, run.id);
    await finished;
    const after = await prisma.shippingQuoteRun.findUnique({ where: { id: run.id } });
    if (after?.status === "READY" && after.failed > 0) {
      const retry = await retryFailedQuotes(run.id, SCHEDULE_ACTOR);
      await retry.finished;
    }
    await pruneScheduledRuns(s.schedule.keepRuns);
  } catch (err) {
    await audit("shipping.scheduled_run_skipped", false, { reason: errorMessage(err) });
  }
}

/** Keeps the newest `keep` scheduled runs (their quotes go with them). */
export async function pruneScheduledRuns(keep: number) {
  const old = await prisma.shippingQuoteRun.findMany({
    where: { startedBy: { in: [SCHEDULE_ACTOR.email, ...OLD_SCHEDULE_ACTORS] }, status: { notIn: ["PENDING", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
    skip: keep,
    select: { id: true },
  });
  if (!old.length) return 0;
  await prisma.shippingQuoteRun.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
  await audit("shipping.scheduled_runs_pruned", true, { deleted: old.length, kept: keep });
  return old.length;
}
