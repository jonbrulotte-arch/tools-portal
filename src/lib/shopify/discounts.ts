import { randomInt } from "node:crypto";
import { z } from "zod";

// Discount configuration submitted by the "New Discount" form.
export const discountConfigSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(255),
    codeMode: z.enum(["single", "bulk"]),
    code: z.string().max(255).optional().default(""),
    bulk: z
      .object({
        count: z.coerce.number().int().min(1).max(1000),
        prefix: z.string().max(40).default(""),
        length: z.coerce.number().int().min(4).max(24).default(8),
      })
      .optional(),
    valueType: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"]),
    value: z.coerce.number().optional(),
    appliesOnEachItem: z.boolean().default(false),
    appliesTo: z.enum(["all", "collections", "products"]).default("all"),
    collectionIds: z.array(z.string()).default([]),
    productIds: z.array(z.string()).default([]),
    minimum: z.enum(["none", "subtotal", "quantity"]).default("none"),
    minimumValue: z.coerce.number().optional(),
    usageLimit: z.coerce.number().int().min(1).optional().nullable(),
    oncePerCustomer: z.boolean().default(false),
    maxShippingPrice: z.coerce.number().min(0).optional().nullable(),
    startsAt: z.string().min(1, "Start date is required"),
    endsAt: z.string().optional().nullable(),
    combinesWith: z
      .object({ orderDiscounts: z.boolean().default(false), productDiscounts: z.boolean().default(false), shippingDiscounts: z.boolean().default(false) })
      .default({ orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }),
  })
  .superRefine((c, ctx) => {
    if (c.codeMode === "single" && !c.code) ctx.addIssue({ code: "custom", path: ["code"], message: "Discount code is required" });
    if (c.codeMode === "single" && c.code && !/^[A-Za-z0-9_-]+$/.test(c.code)) ctx.addIssue({ code: "custom", path: ["code"], message: "Use letters, numbers, - and _ only" });
    if (c.codeMode === "bulk" && !c.bulk) ctx.addIssue({ code: "custom", path: ["bulk"], message: "Bulk settings required" });
    if (c.bulk?.prefix && !/^[A-Za-z0-9_-]*$/.test(c.bulk.prefix)) ctx.addIssue({ code: "custom", path: ["bulk", "prefix"], message: "Use letters, numbers, - and _ only" });
    if (c.valueType === "PERCENTAGE" && (c.value === undefined || c.value <= 0 || c.value > 100))
      ctx.addIssue({ code: "custom", path: ["value"], message: "Percentage must be between 0 and 100" });
    if (c.valueType === "FIXED_AMOUNT" && (c.value === undefined || c.value <= 0)) ctx.addIssue({ code: "custom", path: ["value"], message: "Amount must be greater than 0" });
    if (c.valueType !== "FREE_SHIPPING" && c.appliesTo === "collections" && c.collectionIds.length === 0)
      ctx.addIssue({ code: "custom", path: ["collectionIds"], message: "Pick at least one collection" });
    if (c.valueType !== "FREE_SHIPPING" && c.appliesTo === "products" && c.productIds.length === 0)
      ctx.addIssue({ code: "custom", path: ["productIds"], message: "Pick at least one product" });
    if (c.minimum !== "none" && (c.minimumValue === undefined || c.minimumValue <= 0))
      ctx.addIssue({ code: "custom", path: ["minimumValue"], message: "Minimum must be greater than 0" });
    if (c.endsAt && new Date(c.endsAt) <= new Date(c.startsAt)) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after start" });
  });

export type DiscountConfig = z.infer<typeof discountConfigSchema>;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function generateCodes(count: number, prefix: string, length: number): string[] {
  const out = new Set<string>();
  while (out.size < count) {
    let s = "";
    for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
    out.add(`${prefix}${s}`.toUpperCase());
  }
  return [...out];
}

function money(n: number) {
  return n.toFixed(2);
}

function minimumRequirement(c: DiscountConfig) {
  if (c.minimum === "subtotal") return { subtotal: { greaterThanOrEqualToSubtotal: money(c.minimumValue!) } };
  if (c.minimum === "quantity") return { quantity: { greaterThanOrEqualToQuantity: String(Math.floor(c.minimumValue!)) } };
  return null;
}

/** Build the GraphQL mutation + variables for the first code; any further codes are added with discountRedeemCodeBulkAdd. */
export function buildDiscountMutation(c: DiscountConfig, firstCode: string): { mutation: string; variables: Record<string, unknown>; resultKey: string } {
  const common = {
    title: c.title,
    code: firstCode,
    // Required since the 2025 API versions (replaces customerSelection): every buyer can use the code.
    context: { all: "ALL" },
    startsAt: new Date(c.startsAt).toISOString(),
    endsAt: c.endsAt ? new Date(c.endsAt).toISOString() : null,
    usageLimit: c.usageLimit ?? null,
    appliesOncePerCustomer: c.oncePerCustomer,
    combinesWith: c.combinesWith,
    minimumRequirement: minimumRequirement(c),
  };

  if (c.valueType === "FREE_SHIPPING") {
    return {
      resultKey: "discountCodeFreeShippingCreate",
      mutation: `mutation CreateFreeShipping($input: DiscountCodeFreeShippingInput!) {
  discountCodeFreeShippingCreate(freeShippingCodeDiscount: $input) {
    codeDiscountNode { id }
    userErrors { field code message }
  }
}`,
      variables: {
        input: {
          ...common,
          destination: { all: true },
          ...(c.maxShippingPrice != null ? { maximumShippingPrice: money(c.maxShippingPrice) } : {}),
        },
      },
    };
  }

  const value =
    c.valueType === "PERCENTAGE"
      ? { percentage: Number((c.value! / 100).toFixed(4)) }
      : { discountAmount: { amount: money(c.value!), appliesOnEachItem: c.appliesOnEachItem } };
  const items =
    c.appliesTo === "collections"
      ? { collections: { add: c.collectionIds } }
      : c.appliesTo === "products"
        ? { products: { productsToAdd: c.productIds } }
        : { all: true };

  return {
    resultKey: "discountCodeBasicCreate",
    mutation: `mutation CreateBasic($input: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $input) {
    codeDiscountNode { id }
    userErrors { field code message }
  }
}`,
    variables: { input: { ...common, customerGets: { value, items } } },
  };
}

export const BULK_ADD_MUTATION = `mutation BulkAdd($discountId: ID!, $codes: [DiscountRedeemCodeInput!]!) {
  discountRedeemCodeBulkAdd(discountId: $discountId, codes: $codes) {
    bulkCreation { id }
    userErrors { field code message }
  }
}`;

export function describeDiscount(c: Pick<DiscountConfig, "valueType" | "value">, currency?: string | null): string {
  if (c.valueType === "FREE_SHIPPING") return "Free shipping";
  if (c.valueType === "PERCENTAGE") return `${c.value}% off`;
  return `${currency ? currency + " " : "$"}${Number(c.value ?? 0).toFixed(2)} off`;
}
