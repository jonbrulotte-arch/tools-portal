import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { parseBody } from "@/lib/api";
import { getSetting, setSetting } from "@/lib/settings";
import { formPresetSchema } from "@/lib/shopify/form-presets";
import { logAudit } from "@/lib/audit";
import { toolSettingsPermission } from "@/lib/permissions";

// Presets + locks for the New Discount form. Requires the tool's "manage tool settings" permission.
export async function PATCH(req: Request) {
  const actor = await guard({ tool: "shopify-discounts", permission: toolSettingsPermission("shopify-discounts") });
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(req, formPresetSchema);
  if (body instanceof NextResponse) return body;
  const before = await getSetting("shopifyDiscountForm");
  const value = { ...body, minimum: { ...body.minimum, value: body.minimum.type === "none" ? null : body.minimum.value } };
  await setSetting("shopifyDiscountForm", value);
  await logAudit({
    action: "shopify.form_settings_updated",
    category: "SHOPIFY",
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: "Setting",
    targetId: "shopifyDiscountForm",
    metadata: { before, after: value },
  });
  return NextResponse.json({ ok: true });
}
