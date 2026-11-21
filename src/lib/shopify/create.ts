import type { Prisma, ShopifyStore } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/api";
import { adminGraphql } from "@/lib/shopify/client";
import { BULK_ADD_MUTATION, buildDiscountMutation, generateCodes, type DiscountConfig } from "@/lib/shopify/discounts";

type UserErrors = { field?: string[] | null; code?: string | null; message: string }[];

/** Create the discount on one store and record the attempt (success or failure). */
export async function createDiscountOnStore(store: ShopifyStore, config: DiscountConfig, actor: { id: string; email: string }) {
  const codes =
    config.codeMode === "bulk" && config.bulk
      ? generateCodes(config.bulk.count, config.bulk.prefix, config.bulk.length)
      : [config.code.toUpperCase()];
  const { mutation, variables, resultKey } = buildDiscountMutation(config, codes[0]);
  const responses: Record<string, unknown> = {};
  let shopifyDiscountId: string | null = null;
  let error: string | null = null;

  try {
    const data = await adminGraphql<Record<string, { codeDiscountNode: { id: string } | null; userErrors: UserErrors }>>(store, mutation, variables);
    responses.create = data;
    const result = data[resultKey];
    if (result?.userErrors?.length) throw new Error(result.userErrors.map((e) => e.message).join("; "));
    shopifyDiscountId = result?.codeDiscountNode?.id ?? null;
    if (!shopifyDiscountId) throw new Error("Shopify did not return a discount ID");

    const extra = codes.slice(1);
    for (let i = 0; i < extra.length; i += 250) {
      const chunk = extra.slice(i, i + 250).map((code) => ({ code }));
      const bulk = await adminGraphql<{ discountRedeemCodeBulkAdd: { bulkCreation: { id: string } | null; userErrors: UserErrors } }>(store, BULK_ADD_MUTATION, {
        discountId: shopifyDiscountId,
        codes: chunk,
      });
      responses[`bulk_${i / 250}`] = bulk;
      if (bulk.discountRedeemCodeBulkAdd.userErrors.length) {
        throw new Error(`Discount created but adding extra codes failed: ${bulk.discountRedeemCodeBulkAdd.userErrors.map((e) => e.message).join("; ")}`);
      }
    }
  } catch (err) {
    error = errorMessage(err);
  }

  const record = await prisma.shopifyDiscount.create({
    data: {
      storeId: store.id,
      createdById: actor.id,
      createdByEmail: actor.email,
      title: config.title,
      valueType: config.valueType,
      value: config.valueType === "FREE_SHIPPING" ? null : config.value,
      codes,
      config: config as unknown as Prisma.InputJsonValue,
      shopifyDiscountId,
      status: error ? "FAILED" : "CREATED",
      errorMessage: error,
      requestPayload: variables as Prisma.InputJsonValue,
      responsePayload: responses as Prisma.InputJsonValue,
      startsAt: new Date(config.startsAt),
      endsAt: config.endsAt ? new Date(config.endsAt) : null,
    },
  });

  await logAudit({
    action: error ? "shopify.discount_failed" : "shopify.discount_created",
    category: "SHOPIFY",
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: "ShopifyDiscount",
    targetId: record.id,
    success: !error,
    metadata: { store: store.shopDomain, title: config.title, codes: codes.slice(0, 20), codeCount: codes.length, valueType: config.valueType, value: config.value, error },
  });

  return { record, error };
}
