import { describe, expect, it } from "vitest";
import { buildTimeline, JOB_NAMES, type JobKey, type TimelineJob } from "@/lib/shipping/schedule-timeline";

const TZ = "America/Los_Angeles";
const weekly = (weekday: number, hour: number, enabled = true) => ({ enabled, frequency: "weekly" as const, weekday, hour, timezone: TZ });
const daily = (hour: number) => ({ enabled: true, frequency: "daily" as const, weekday: 0, hour, timezone: TZ });
const H = 3_600_000;
// your schedule: Products Fri 5 PM, cost import Sat 8 PM, quote run Sun 6 PM, inventory daily 2 PM, push Wed 6 AM
const jobs = (productsHours: number | null, over: Partial<Record<JobKey, TimelineJob["recurrence"]>> = {}): TimelineJob[] =>
  (
    [
      ["products", weekly(5, 17), productsHours == null ? null : productsHours * H],
      ["costImport", weekly(6, 20), 5 * 60_000],
      ["quoteRun", weekly(0, 18), 1.1 * H],
      ["inventory", daily(14), 40 * 60_000],
      ["push", weekly(3, 6), 10 * 60_000],
    ] as const
  ).map(([key, recurrence, lastDurationMs]) => ({ key, name: JOB_NAMES[key], recurrence: over[key] ?? recurrence, lastDurationMs }));
const now = new Date("2026-11-20T20:00:00Z"); // Friday 12 PM Pacific

describe("schedule timeline", () => {
  it("orders the jobs by their next start", () => {
    const t = buildTimeline(jobs(40), now);
    expect(t.items.map((i) => i.key)).toEqual(["inventory", "products", "costImport", "quoteRun", "push"]);
    expect(t.items.find((i) => i.key === "products")!.next!.toISOString()).toBe("2026-11-21T01:00:00.000Z"); // Fri 5 PM PST
  });

  it("is quiet for a Products run that finishes before the quote run, except daytime inventory", () => {
    expect(buildTimeline(jobs(40), now).warnings).toEqual([expect.stringMatching(/^Mango inventory runs during working hours/)]);
  });

  it("warns when the Products run would still be running at the quote run, or at the push", () => {
    expect(buildTimeline(jobs(50), now).warnings.some((w) => w.startsWith("Scheduled quote run starts while Products (Salsify list)"))).toBe(true);
    const late = buildTimeline(jobs(40, { products: weekly(1, 20) }), now); // Monday 8 PM + 40 h → past Wed 6 AM
    expect(late.warnings.some((w) => w.includes("push the previous week's values"))).toBe(true);
  });

  it("can't predict without a past run, and lists jobs that are off", () => {
    const t = buildTimeline(jobs(null, { push: weekly(3, 6, false), inventory: daily(2) }), now);
    expect(t.items.find((i) => i.key === "products")!.expectedEnd).toBeNull();
    expect(t.warnings).toEqual(["Push blended cost to Salsify is off, so it only runs when started by hand."]);
  });
});
