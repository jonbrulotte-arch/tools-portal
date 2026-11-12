import { z } from "zod";
import type { ShopifyDiscountFormSettings } from "@/lib/settings";
import type { DiscountConfig } from "@/lib/shopify/discounts";

// Admin presets + locks for the New Discount form (Requirements & limits, Combinations).
// Locks bind non-admins only; admins can always change these fields.

export const formPresetSchema = z
  .object({
    minimum: z.object({
      type: z.enum(["none", "subtotal", "quantity"]),
      value: z.coerce.number().positive().nullable().default(null),
      locked: z.boolean(),
    }),
    usageLimit: z.object({ enabled: z.boolean(), count: z.coerce.number().int().min(1).max(1_000_000), locked: z.boolean() }),
    oncePerCustomer: z.object({ enabled: z.boolean(), locked: z.boolean() }),
    combinesWith: z.object({ productDiscounts: z.boolean(), orderDiscounts: z.boolean(), shippingDiscounts: z.boolean(), locked: z.boolean() }),
  })
  .superRefine((p, ctx) => {
    if (p.minimum.type !== "none" && !p.minimum.value) {
      ctx.addIssue({ code: "custom", path: ["minimum", "value"], message: "Enter the minimum amount or quantity" });
    }
    if (p.minimum.type === "quantity" && p.minimum.value && !Number.isInteger(p.minimum.value)) {
      ctx.addIssue({ code: "custom", path: ["minimum", "value"], message: "Minimum quantity must be a whole number" });
    }
  });

export type LockedGroup = "minimum" | "usageLimit" | "oncePerCustomer" | "combinesWith";

export const GROUP_LABELS: Record<LockedGroup, string> = {
  minimum: "Minimum purchase requirement",
  usageLimit: "Total usage limit",
  oncePerCustomer: "One use per customer",
  combinesWith: "Combinations",
};

type LockableConfig = Pick<DiscountConfig, "minimum" | "minimumValue" | "usageLimit" | "oncePerCustomer" | "combinesWith">;

/** Locked groups whose submitted values differ from the admin preset. */
export function lockViolations(c: LockableConfig, p: ShopifyDiscountFormSettings): LockedGroup[] {
  const out: LockedGroup[] = [];
  if (p.minimum.locked) {
    const same = c.minimum === p.minimum.type && (p.minimum.type === "none" || Number(c.minimumValue) === Number(p.minimum.value));
    if (!same) out.push("minimum");
  }
  if (p.usageLimit.locked) {
    const submitted = c.usageLimit ?? null;
    const expected = p.usageLimit.enabled ? p.usageLimit.count : null;
    if (submitted !== expected) out.push("usageLimit");
  }
  if (p.oncePerCustomer.locked && c.oncePerCustomer !== p.oncePerCustomer.enabled) out.push("oncePerCustomer");
  if (p.combinesWith.locked) {
    const w = c.combinesWith;
    if (w.productDiscounts !== p.combinesWith.productDiscounts || w.orderDiscounts !== p.combinesWith.orderDiscounts || w.shippingDiscounts !== p.combinesWith.shippingDiscounts) {
      out.push("combinesWith");
    }
  }
  return out;
}

/** Initial values for the New Discount form's lockable fields. */
export function presetFormValues(p: ShopifyDiscountFormSettings) {
  return {
    minimum: p.minimum.type,
    minimumValue: p.minimum.type === "none" || p.minimum.value == null ? "" : String(p.minimum.value),
    limitTotal: p.usageLimit.enabled,
    usageLimit: String(p.usageLimit.count),
    oncePerCustomer: p.oncePerCustomer.enabled,
    combines: {
      productDiscounts: p.combinesWith.productDiscounts,
      orderDiscounts: p.combinesWith.orderDiscounts,
      shippingDiscounts: p.combinesWith.shippingDiscounts,
    },
  };
}
