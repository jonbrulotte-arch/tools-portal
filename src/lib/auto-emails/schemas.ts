import { z } from "zod";
import { assertReadOnly } from "@/lib/auto-emails/sql";
import { TIMEZONE_IDS } from "@/lib/timezone";

const emailAddress = z.string().trim().toLowerCase().email("Enter valid email addresses");
const addressList = z.array(emailAddress).max(50, "At most 50 addresses");

const readOnlySql = z
  .string()
  .max(50_000)
  .superRefine((q, ctx) => {
    try {
      assertReadOnly(q);
    } catch (err) {
      ctx.addIssue({ code: "custom", message: (err as Error).message });
    }
  });

export const autoEmailSchema = z
  .object({
    name: z.string().trim().min(1, "Give the email a name").max(120),
    enabled: z.boolean(),
    to: addressList,
    cc: addressList,
    subject: z.string().trim().min(1, "Enter a subject").max(200),
    appendDate: z.boolean(),
    introText: z.string().max(10_000),
    sqlQuery: readOnlySql,
    keyColumns: z.array(z.string().trim().min(1).max(128)).min(1, "Choose at least one key column").max(10),
    closingText: z.string().max(10_000),
  })
  .superRefine((e, ctx) => {
    if (e.enabled && !e.to.length) ctx.addIssue({ code: "custom", path: ["to"], message: "Add at least one 'To' address before turning the email on" });
  });

export type AutoEmailInput = z.infer<typeof autoEmailSchema>;

export const queryPreviewSchema = z.object({
  sqlQuery: readOnlySql,
  keyColumns: z.array(z.string().max(128)).max(10).default([]),
  emailId: z.string().max(40).nullable().optional(),
});

export const emailPreviewSchema = z.object({
  emailId: z.string().max(40).nullable().optional(),
  subject: z.string().max(200),
  appendDate: z.boolean(),
  introText: z.string().max(10_000),
  closingText: z.string().max(10_000),
  sqlQuery: readOnlySql,
  keyColumns: z.array(z.string().max(128)).max(10).default([]),
});

export const autoEmailSettingsSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.union([z.literal(5), z.literal(15), z.literal(30), z.literal(60)]),
  maxRowsPerEmail: z.coerce.number().int().min(1).max(5000),
  keyRetentionDays: z.coerce.number().int().min(30, "Keep sent records at least 30 days (longer than any query's look-back)").max(3650),
  logRetentionDays: z.coerce.number().int().min(7).max(3650),
  dateFormat: z.enum(["MM/DD/YYYY", "YYYY-MM-DD", "DD/MM/YYYY"]),
  timezone: z.enum(TIMEZONE_IDS),
  graph: z.object({
    // blank keeps the saved (encrypted) value
    tenantId: z.string().trim().max(100).optional(),
    clientId: z.string().trim().max(100).optional(),
    clientSecret: z.string().max(500).optional(),
    clearSecret: z.boolean().optional(),
    senderAddress: z.union([z.literal(""), emailAddress]),
    senderName: z.string().trim().max(100),
  }),
  sql: z.object({
    server: z.string().trim().max(200),
    port: z.coerce.number().int().min(1).max(65535),
    database: z.string().trim().max(128),
    authType: z.enum(["sql", "windows"]),
    domain: z.string().trim().max(100).regex(/^[\w.-]*$/, "Enter just the domain, e.g. STEELMANJS"),
    user: z.string().trim().max(128).optional(),
    password: z.string().max(500).optional(),
    clearPassword: z.boolean().optional(),
    encrypt: z.boolean(),
    trustServerCertificate: z.boolean(),
  }),
});
