import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireTool } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { toolSettingsPermission } from "@/lib/permissions";
import { FormSettingsClient } from "./form-settings-client";

export const metadata: Metadata = { title: "Discount form settings" };

export default async function FormSettingsPage() {
  const user = await requireTool("shopify-discounts");
  const permission = toolSettingsPermission("shopify-discounts");
  if (!user.can(permission)) {
    await logAudit({ action: "access.denied", category: "AUTH", actorId: user.id, actorEmail: user.email, success: false, metadata: { page: "shopify-discounts/settings", permission } });
    redirect("/tools/shopify-discounts");
  }
  return <FormSettingsClient initial={await getSetting("shopifyDiscountForm")} />;
}
