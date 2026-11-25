import { describe, expect, it } from "vitest";
import { formPresetSchema, lockViolations, presetFormValues } from "@/lib/shopify/form-presets";
import { SETTING_DEFAULTS, type ShopifyDiscountFormSettings } from "@/lib/settings";

const base = {
  minimum: "none" as const,
  minimumValue: undefined,
  usageLimit: 1,
  oncePerCustomer: true,
  combinesWith: { productDiscounts: false, orderDiscounts: false, shippingDiscounts: false },
};

const locked = (patch: Partial<ShopifyDiscountFormSettings> = {}): ShopifyDiscountFormSettings => ({
  minimum: { type: "subtotal", value: 50, locked: true },
  usageLimit: { enabled: true, count: 1, locked: true },
  oncePerCustomer: { enabled: true, locked: true },
  combinesWith: { productDiscounts: false, orderDiscounts: false, shippingDiscounts: false, locked: true },
  ...patch,
});

describe("discount form presets", () => {
  it("defaults lock nothing, so anything is allowed", () => {
    expect(lockViolations({ ...base, usageLimit: 999, oncePerCustomer: false }, SETTING_DEFAULTS.shopifyDiscountForm)).toEqual([]);
  });

  it("accepts a submission that matches every locked group", () => {
    expect(lockViolations({ ...base, minimum: "subtotal", minimumValue: 50 }, locked())).toEqual([]);
  });

  it("reports each locked group that differs", () => {
    const v = lockViolations(
      { minimum: "subtotal", minimumValue: 10, usageLimit: 5, oncePerCustomer: false, combinesWith: { productDiscounts: true, orderDiscounts: false, shippingDiscounts: false } },
      locked(),
    );
    expect(v).toEqual(["minimum", "usageLimit", "oncePerCustomer", "combinesWith"]);
  });

  it("treats a locked 'no limit' as usageLimit null", () => {
    const p = locked({ usageLimit: { enabled: false, count: 1, locked: true } });
    expect(lockViolations({ ...base, minimum: "subtotal", minimumValue: 50, usageLimit: null }, p)).toEqual([]);
    expect(lockViolations({ ...base, minimum: "subtotal", minimumValue: 50, usageLimit: 1 }, p)).toEqual(["usageLimit"]);
  });

  it("ignores differences in unlocked groups", () => {
    const p = locked({ minimum: { type: "subtotal", value: 50, locked: false } });
    expect(lockViolations({ ...base, minimum: "none" }, p)).toEqual([]);
  });

  it("validates presets", () => {
    expect(formPresetSchema.safeParse({ ...locked(), minimum: { type: "subtotal", value: null, locked: false } }).success).toBe(false);
    expect(formPresetSchema.safeParse({ ...locked(), minimum: { type: "quantity", value: 2.5, locked: false } }).success).toBe(false);
    expect(formPresetSchema.safeParse({ ...locked(), usageLimit: { enabled: true, count: 0, locked: false } }).success).toBe(false);
    expect(formPresetSchema.safeParse(locked()).success).toBe(true);
  });

  it("turns presets into form values", () => {
    expect(presetFormValues(locked())).toMatchObject({ minimum: "subtotal", minimumValue: "50", limitTotal: true, usageLimit: "1", oncePerCustomer: true });
  });
});
