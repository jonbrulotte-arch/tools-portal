import { describe, expect, it } from "vitest";
import { buildDiscountMutation, discountConfigSchema, generateCodes } from "@/lib/shopify/discounts";
import { normalizeShopDomain } from "@/lib/shopify/client";

const base = { title: "BF", codeMode: "single", code: "SAVE20", valueType: "PERCENTAGE", value: 20, startsAt: "2026-11-27T05:00:00.000Z" };

describe("discount config", () => {
  it("builds a percentage basic discount for all products", () => {
    const c = discountConfigSchema.parse(base);
    const { mutation, variables, resultKey } = buildDiscountMutation(c, "SAVE20");
    expect(resultKey).toBe("discountCodeBasicCreate");
    expect(mutation).toContain("discountCodeBasicCreate(basicCodeDiscount: $input)");
    const input = (variables.input as Record<string, unknown>);
    expect(input.code).toBe("SAVE20");
    expect(input.context).toEqual({ all: "ALL" });
    expect(input.customerGets).toEqual({ value: { percentage: 0.2 }, items: { all: true } });
    expect(input.minimumRequirement).toBeNull();
  });

  it("builds a fixed amount discount on collections with a minimum subtotal", () => {
    const c = discountConfigSchema.parse({ ...base, valueType: "FIXED_AMOUNT", value: 15, appliesTo: "collections", collectionIds: ["gid://shopify/Collection/1"], minimum: "subtotal", minimumValue: 100, usageLimit: 50, oncePerCustomer: true });
    const input = buildDiscountMutation(c, "X").variables.input as Record<string, unknown>;
    expect(input.customerGets).toEqual({ value: { discountAmount: { amount: "15.00", appliesOnEachItem: false } }, items: { collections: { add: ["gid://shopify/Collection/1"] } } });
    expect(input.minimumRequirement).toEqual({ subtotal: { greaterThanOrEqualToSubtotal: "100.00" } });
    expect(input.usageLimit).toBe(50);
    expect(input.appliesOncePerCustomer).toBe(true);
  });

  it("builds a free shipping discount", () => {
    const c = discountConfigSchema.parse({ ...base, valueType: "FREE_SHIPPING", value: undefined, maxShippingPrice: 20 });
    const { resultKey, variables } = buildDiscountMutation(c, "SHIP");
    expect(resultKey).toBe("discountCodeFreeShippingCreate");
    expect(variables.input).toMatchObject({ context: { all: "ALL" }, destination: { all: true }, maximumShippingPrice: "20.00" });
  });

  it("validates bad input", () => {
    expect(discountConfigSchema.safeParse({ ...base, value: 150 }).success).toBe(false);
    expect(discountConfigSchema.safeParse({ ...base, code: "has space" }).success).toBe(false);
    expect(discountConfigSchema.safeParse({ ...base, endsAt: "2026-11-01T00:00:00Z" }).success).toBe(false);
    expect(discountConfigSchema.safeParse({ ...base, appliesTo: "products" }).success).toBe(false);
  });

  it("generates unique prefixed codes", () => {
    const codes = generateCodes(200, "VIP-", 8);
    expect(new Set(codes).size).toBe(200);
    expect(codes.every((c) => /^VIP-[A-Z2-9]{8}$/.test(c))).toBe(true);
  });

  it("normalises shop domains", () => {
    expect(normalizeShopDomain("My-Shop")).toBe("my-shop.myshopify.com");
    expect(normalizeShopDomain("https://my-shop.myshopify.com/admin")).toBe("my-shop.myshopify.com");
    expect(() => normalizeShopDomain("evil.com")).toThrow();
  });
});
