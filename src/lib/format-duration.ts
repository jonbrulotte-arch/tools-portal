// Elapsed-time display for background jobs (quote runs, Products runs). Safe for client components.

/** "4m 05s", "1h 02m" */
export function duration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(sec).padStart(2, "0")}s`;
}

/** Elapsed time of a job's current pass (live while it runs). */
export function elapsedMs(job: { startedAt: string; finishedAt: string | null }, now: number) {
  return (job.finishedAt ? Date.parse(job.finishedAt) : now) - Date.parse(job.startedAt);
}

/** Speed and time left from items done so far in this pass. */
export function pace(job: { startedAt: string; finishedAt: string | null; done: number; total: number }, now: number, doneBefore = 0) {
  const ms = elapsedMs(job, now);
  const doneThisPass = job.done - doneBefore;
  const perMin = ms > 5000 && doneThisPass > 0 ? doneThisPass / (ms / 60000) : null;
  return { ms, perMin, etaMs: perMin && job.total ? ((job.total - job.done) / perMin) * 60000 : null };
}
