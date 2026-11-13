import { z } from "zod";

const zip = z.string().regex(/^\d{5}$/, "ZIP codes must be 5 digits");

export const shippingSettingsSchema = z
  .object({
    origins: z
      .array(z.object({ code: z.string().regex(/^[A-Z0-9]{1,8}$/, "Codes are 1–8 capital letters/digits"), name: z.string().min(1).max(60), zip }))
      .min(1)
      .max(10),
    upsAccounts: z.record(z.string().regex(/^[A-Z0-9]{6}$/i, "UPS accounts are 6 characters"), z.string()),
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
  });
