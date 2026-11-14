import { z } from "zod";
import { TIMEZONE_IDS } from "@/lib/timezone";
import { normalizeListId } from "@/lib/salsify";

const zip = z.string().regex(/^\d{5}$/, "ZIP codes must be 5 digits");

export const shippingSettingsSchema = z
  .object({
    origins: z
      .array(z.object({ code: z.string().regex(/^[A-Z0-9]{1,8}$/, "Codes are 1–8 capital letters/digits"), name: z.string().min(1).max(60), zip }))
      .min(1)
      .max(10),
    upsAccounts: z.record(z.string().regex(/^[A-Z0-9]{6}$/i, "UPS accounts are 6 characters"), z.string()),
    upsRatingAccounts: z.record(z.string(), z.string().max(6)).default({}),
    schedule: z.object({
      enabled: z.boolean(),
      frequency: z.enum(["daily", "weekly"]),
      weekday: z.coerce.number().int().min(0).max(6),
      hour: z.coerce.number().int().min(0).max(23),
      timezone: z.enum(TIMEZONE_IDS),
      keepRuns: z.coerce.number().int().min(1, "Keep at least 1").max(90, "At most 90"),
    }),
    mangoImport: z.object({
      enabled: z.boolean(),
      url: z
        .string()
        .trim()
        .url("Enter the full export URL")
        .refine((u) => /^https?:\/\//i.test(u), "Must be an http:// or https:// URL")
        .refine((u) => !new URL(u).search, "Leave out the ?from=…&to=… part; the portal adds the dates"),
      days: z.coerce.number().int().min(7, "At least 7 days").max(365, "At most 365 days"),
      frequency: z.enum(["daily", "weekly"]),
      weekday: z.coerce.number().int().min(0).max(6),
      hour: z.coerce.number().int().min(0).max(23),
      timezone: z.enum(TIMEZONE_IDS),
      keepReports: z.coerce.number().int().min(1, "Keep at least 1").max(90, "At most 90"),
    }),
    productRates: z.object({
      enabled: z.boolean(),
      listId: z
        .string()
        .max(300)
        .transform(normalizeListId)
        .pipe(z.string().max(100).regex(/^[\w-]*$/, "Paste the list's Salsify address or its ID (letters, digits and dashes)")),
      keyUserId: z.string().max(40).nullable(),
      frequency: z.enum(["daily", "weekly"]),
      weekday: z.coerce.number().int().min(0).max(6),
      hour: z.coerce.number().int().min(0).max(23),
      timezone: z.enum(TIMEZONE_IDS),
      keepRuns: z.coerce.number().int().min(1, "Keep at least 1").max(26, "At most 26"),
    }),
    quoteZips: z.record(z.string(), z.record(z.string(), z.union([zip, z.literal("")]))),
    uspsMaxLb: z.coerce.number().int().min(1).max(70),
    upsMaxLb: z.coerce.number().int().min(1).max(150),
    mode: z.enum(["simulated", "live"]),
    ups: z.object({
      clientId: z.string().max(200),
      clientSecret: z.string().max(500).optional(),
      clearSecret: z.boolean().optional(),
      environment: z.enum(["production", "test"]),
      apiVersion: z.string().regex(/^v\d{1,4}$/, "Looks like v2403"),
    }),
    endicia: z.object({
      requesterId: z.string().max(100),
      accountId: z.string().max(100),
      passPhrase: z.string().max(200).optional(),
      clearPassPhrase: z.boolean().optional(),
      endpoint: z
        .string()
        .url()
        .refine((u) => u.startsWith("https://"), "Must be an https:// URL"),
    }),
    salsify: z.object({
      orgId: z.string().max(100),
      fields: z.object({
        name: z.string().max(200),
        weight: z.string().min(1, "Weight field name is required").max(200),
        length: z.string().min(1, "Length field name is required").max(200),
        width: z.string().min(1, "Width field name is required").max(200),
        height: z.string().min(1, "Height field name is required").max(200),
        packaging: z.string().max(200),
        fallback: z.object({ weight: z.string().max(200), length: z.string().max(200), width: z.string().max(200), height: z.string().max(200) }),
      }),
    }),
  })
  .superRefine((s, ctx) => {
    const codes = new Set(s.origins.map((o) => o.code));
    if (codes.size !== s.origins.length) ctx.addIssue({ code: "custom", path: ["origins"], message: "Warehouse codes must be unique" });
    for (const [acct, origin] of Object.entries(s.upsAccounts)) {
      if (!codes.has(origin)) ctx.addIssue({ code: "custom", path: ["upsAccounts", acct], message: `Account ${acct} points to an unknown warehouse` });
    }
    for (const [origin, acct] of Object.entries(s.upsRatingAccounts)) {
      const mapped = Object.entries(s.upsAccounts).find(([a]) => a.toUpperCase() === acct.toUpperCase())?.[1];
      if (mapped !== origin) ctx.addIssue({ code: "custom", path: ["upsRatingAccounts", origin], message: `The quoting account ${acct} must be one of that warehouse's UPS accounts` });
    }
  });
