// Time zones for schedules (backups, scheduled quote runs). The server clock runs on UTC, so a schedule's
// hour is checked in its own time zone. Safe to import from client components.

export const TIMEZONES = [
  { value: "America/Los_Angeles", label: "Pacific (Las Vegas)" },
  { value: "America/Phoenix", label: "Arizona" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/New_York", label: "Eastern (Groveport)" },
  { value: "UTC", label: "UTC" },
] as const;

export type TimeZoneId = (typeof TIMEZONES)[number]["value"];
export const TIMEZONE_IDS = TIMEZONES.map((t) => t.value) as [TimeZoneId, ...TimeZoneId[]];
export const DEFAULT_TIMEZONE: TimeZoneId = "America/Los_Angeles";

export const timezoneLabel = (tz: string) => TIMEZONES.find((t) => t.value === tz)?.label ?? tz;

/** "1:00 AM" */
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Hour (0–23), weekday (0 = Sunday) and date at `at` in a time zone. */
export function zonedParts(at: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { hour: Number(parts.hour), weekday: WEEKDAYS[parts.weekday], date: `${parts.year}-${parts.month}-${parts.day}` };
}

/** A weekly-or-daily schedule at a whole hour in a time zone (scheduled quote runs, Mango imports). */
export type Recurrence = { enabled: boolean; frequency: "daily" | "weekly"; weekday: number; hour: number; timezone: string };

export function isDue(s: Recurrence, at: Date) {
  if (!s.enabled) return false;
  const p = zonedParts(at, s.timezone);
  return p.hour === s.hour && (s.frequency === "daily" || p.weekday === s.weekday);
}

/** The next time the schedule fires (top of the hour), for display. */
export function nextRun(s: Recurrence, from: Date): Date | null {
  if (!s.enabled) return null;
  const t = new Date(from);
  t.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 24 * 8 + 1; i++) {
    t.setUTCHours(t.getUTCHours() + 1);
    if (isDue(s, t)) return new Date(t);
  }
  return null;
}
