import { z } from "zod";
import { TIMEZONE_IDS } from "@/lib/timezone";
import { normalizeListId } from "@/lib/salsify";
import { PACKAGING_TYPES } from "@/lib/packaging/engine";

// Request bodies for the Packaging Configurator APIs.

const inches = (label: string) => z.coerce.number({ message: `${label} must be a number` }).positive(`${label} must be more than 0`).max(1000, `${label} looks too big`);
const optionalNumber = (label: string, max = 100_000) =>
  z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number({ message: `${label} must be a number` }).positive(`${label} must be more than 0`).max(max).nullable());

export const packagingSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(120),
    type: z.enum(PACKAGING_TYPES),
    height: inches("Height"),
    width: inches("Width"),
    length: inches("Length"),
    maxHeight: optionalNumber("Max height", 1000),
    maxWeight: optionalNumber("Max weight"),
    tareWeight: optionalNumber("Packaging weight"),
    notes: z.string().max(500).nullable().optional(),
    active: z.boolean().default(true),
  })
  .superRefine((p, ctx) => {
    if ((p.type === "bubble_mailer" || p.type === "poly_mailer") && p.maxHeight == null)
      ctx.addIssue({ code: "custom", path: ["maxHeight"], message: "Mailers need a max height (how thick the contents can be); without it they're treated as rigid boxes" });
  });

const rateBreak = z.object({ maxWeight: z.coerce.number().positive("Each break needs a weight more than 0"), rate: z.coerce.number().min(0, "Rates can't be negative") });

export const ratesSchema = z.object({ rates: z.array(rateBreak).max(500) }).superRefine((b, ctx) => {
  const seen = new Set<number>();
  for (const r of b.rates) {
    if (seen.has(r.maxWeight)) ctx.addIssue({ code: "custom", path: ["rates"], message: `The ${r.maxWeight} lb break is listed twice` });
    seen.add(r.maxWeight);
  }
});

export const methodSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(120),
    minWeight: z.coerce.number().min(0).default(0),
    maxWeight: optionalNumber("Max weight"),
    dimDivisor: optionalNumber("DIM divisor", 10_000),
    dimThreshold: optionalNumber("DIM threshold", 1_000_000),
    isLtl: z.boolean().default(false),
    active: z.boolean().default(true),
    notes: z.string().max(500).nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .superRefine((m, ctx) => {
    if (m.maxWeight != null && m.maxWeight < m.minWeight) ctx.addIssue({ code: "custom", path: ["maxWeight"], message: "Max weight is below the min weight" });
  });

const item = z.object({ partNumber: z.string().min(1).max(100), quantity: z.coerce.number().int().min(1).max(10_000) });
export const analyzeSchema = z.object({ items: z.array(item).min(1, "Add at least one product").max(200) });

const manualItem = z.object({
  name: z.string().max(120).optional(),
  height: inches("Height"),
  width: inches("Width"),
  length: inches("Length"),
  weight: z.coerce.number().positive("Weight must be more than 0").max(10_000),
  quantity: z.coerce.number().int().min(1).max(10_000),
  foldable: z.boolean().default(false),
  shipsOwn: z.boolean().default(false),
});
export const manualSchema = z.object({ items: z.array(manualItem).min(1, "Add at least one item").max(50) });

const schedule = {
  enabled: z.boolean(),
  frequency: z.enum(["daily", "weekly"]),
  weekday: z.coerce.number().int().min(0).max(6),
  hour: z.coerce.number().int().min(0).max(23),
  timezone: z.enum(TIMEZONE_IDS),
};
const prop = z.string().max(200);

export const packagingSettingsSchema = z
  .object({
    engine: z.object({
      dimDivisor: z.coerce.number().min(1).max(1000),
      packEfficiency: z.coerce.number().min(0.1, "Pack efficiency is a share between 0.1 and 1").max(1, "Pack efficiency is a share between 0.1 and 1"),
      ltlThreshold: z.coerce.number().min(1).max(100_000),
      fitClearance: z.coerce.number().min(0).max(12),
    }),
    salsify: z.object({
      orgId: z.string().max(100),
      listId: z
        .string()
        .max(300)
        .transform(normalizeListId)
        .pipe(z.string().max(100).regex(/^[\w-]*$/, "Paste the list's Salsify address or its ID (letters, digits and dashes)")),
      keyUserId: z.string().max(40).nullable(),
      fields: z.object({
        name: prop.min(1, "The name field is required"),
        length: prop.min(1, "The length field is required"),
        width: prop.min(1, "The width field is required"),
        height: prop.min(1, "The height field is required"),
        weight: prop.min(1, "The weight field is required"),
        upc: prop,
        foldable: prop,
        shipsOwn: prop,
        packedLength: prop,
        packedWidth: prop,
        packedHeight: prop,
        packedWeight: prop,
      }),
    }),
    sync: z.object(schedule),
    push: z.object({ ...schedule, properties: z.object({ length: prop, width: prop, height: prop, weight: prop }) }),
  })
  .superRefine((s, ctx) => {
    if (s.sync.enabled && !s.salsify.listId) ctx.addIssue({ code: "custom", path: ["salsify", "listId"], message: "Set the Salsify list before turning on the scheduled sync" });
    if (s.push.enabled) {
      for (const k of ["length", "width", "height", "weight"] as const)
        if (!s.push.properties[k]) ctx.addIssue({ code: "custom", path: ["push", "properties", k], message: `Enter the Salsify property for the shipping ${k}` });
    }
  });

/** Settings → test: read a few products from the list (with an optional part number to show). */
export const listTestSchema = z.object({ settings: packagingSettingsSchema });
