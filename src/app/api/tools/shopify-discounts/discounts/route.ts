import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { parseBody, jsonError } from "@/lib/api";
import { discountConfigSchema } from "@/lib/shopify/discounts";
import { createDiscountOnStore } from "@/lib/shopify/create";
import { getSetting } from "@/lib/settings";
import { GROUP_LABELS, lockViolations } from "@/lib/shopify/form-presets";
import { logAudit } from "@/lib/audit";
import { toolSettingsPermission } from "@/lib/permissions";

const schema = z.object({ storeIds: z.array(z.string()).min(1, "Select at least one store").max(20), config: discountConfigSchema });

export async function POST(req: Request) {
  const actor = await guard({ tool: "shopify-discounts" });
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(req, schema);
  if (body instanceof NextResponse) return body;

  // Locked form settings bind everyone except admins and the tool's settings managers; enforced here, not just in the form.
  if (!actor.isAdmin && !actor.can(toolSettingsPermission("shopify-discounts"))) {
    const violations = lockViolations(body.config, await getSetting("shopifyDiscountForm"));
    if (violations.length) {
      await logAudit({
        action: "shopify.discount_blocked_by_lock",
        category: "SHOPIFY",
        actorId: actor.id,
        actorEmail: actor.email,
        success: false,
        metadata: { lockedFields: violations, title: body.config.title, storeIds: body.storeIds },
      });
      return jsonError(`Some settings are locked by an admin and have changed (${violations.map((v) => GROUP_LABELS[v]).join(", ")}). Reload the page and try again.`);
    }
  }
  const stores = await prisma.shopifyStore.findMany({ where: { id: { in: body.storeIds }, enabled: true } });
  if (stores.length !== new Set(body.storeIds).size) return jsonError("One or more selected stores are unavailable");
  if (stores.length > 1 && (body.config.collectionIds.length || body.config.productIds.length)) {
    return jsonError("Specific products/collections can only be used with a single store (IDs differ between stores).");
  }

  const results = [];
  for (const store of stores) {
    const { record, error } = await createDiscountOnStore(store, body.config, actor);
    results.push({ storeId: store.id, storeName: store.name, id: record.id, status: record.status, codes: record.codes.length, firstCode: record.codes[0], error });
  }
  return NextResponse.json({ ok: results.every((r) => r.status === "CREATED"), results });
}
