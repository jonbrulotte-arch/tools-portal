import { z } from "zod";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-13");

/** Date range for "Import from Mango": at most 365 days, not in the future. */
export const mangoImportSchema = z
  .object({ from: day, to: day })
  .superRefine((b, ctx) => {
    const from = Date.parse(`${b.from}T00:00:00Z`), to = Date.parse(`${b.to}T00:00:00Z`);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return ctx.addIssue({ code: "custom", path: ["from"], message: "Enter valid dates" });
    if (from > to) ctx.addIssue({ code: "custom", path: ["from"], message: "From must be on or before To" });
    if (to - from > 365 * 86400000) ctx.addIssue({ code: "custom", path: ["from"], message: "Import at most 365 days at a time" });
    if (to > Date.now() + 86400000) ctx.addIssue({ code: "custom", path: ["to"], message: "To can't be in the future" });
  });
