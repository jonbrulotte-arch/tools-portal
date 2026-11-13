import { prisma } from "@/lib/prisma";
import { getSetting, type ShippingSchedule } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/api";
import { retryFailedQuotes, startQuoteRun } from "@/lib/shipping/runner";
import { zonedParts } from "@/lib/timezone";

// Nightly quote run: checked hourly by the app scheduler (src/lib/scheduler.ts). Runs once a day at the
// configured hour in the configured time zone (the server clock is UTC), re-quotes failures once, and
// prunes old nightly runs. Manual runs are never pruned.

export const SCHEDULE_ACTOR = { id: null, email: "nightly schedule" } as const;

export { TIMEZONES as SCHEDULE_TIMEZONES, zonedParts } from "@/lib/timezone";

export function isDue(s: ShippingSchedule, at: Date) {
  return s.enabled && zonedParts(at, s.timezone).hour === s.hour;
}

/** The next time the schedule fires (top of the hour), for display. */
export function nextRun(s: ShippingSchedule, from: Date): Date | null {
  if (!s.enabled) return null;
  const t = new Date(from);
  t.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 49; i++) {
    t.setUTCHours(t.getUTCHours() + 1);
    if (zonedParts(t, s.timezone).hour === s.hour) return new Date(t);
  }
  return null;
}

const audit = (action: string, success: boolean, metadata: Record<string, unknown>, targetId?: string) =>
  logAudit({ action, category: "TOOL", actorEmail: SCHEDULE_ACTOR.email, success, targetType: targetId ? "ShippingQuoteRun" : undefined, targetId, metadata, ip: null, userAgent: null });

/** Called every hour on the hour. */
export async function runScheduledQuotes(at = new Date()) {
  const s = await getSetting("shippingRates");
  if (!isDue(s.schedule, at)) return;
  if (s.mode !== "live") return audit("shipping.nightly_skipped", true, { reason: "The tool is in simulated mode" });
  try {
    const { run, finished } = await startQuoteRun(SCHEDULE_ACTOR);
    await audit("shipping.nightly_started", true, { total: run.total }, run.id);
    await finished;
    const after = await prisma.shippingQuoteRun.findUnique({ where: { id: run.id } });
    if (after?.status === "READY" && after.failed > 0) {
      const retry = await retryFailedQuotes(run.id, SCHEDULE_ACTOR);
      await retry.finished;
    }
    await pruneNightlyRuns(s.schedule.keepRuns);
  } catch (err) {
    await audit("shipping.nightly_skipped", false, { reason: errorMessage(err) });
  }
}

/** Keeps the newest `keep` nightly runs (their quotes go with them). */
export async function pruneNightlyRuns(keep: number) {
  const old = await prisma.shippingQuoteRun.findMany({
    where: { startedBy: SCHEDULE_ACTOR.email, status: { notIn: ["PENDING", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
    skip: keep,
    select: { id: true },
  });
  if (!old.length) return 0;
  await prisma.shippingQuoteRun.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
  await audit("shipping.nightly_pruned", true, { deleted: old.length, kept: keep });
  return old.length;
}
