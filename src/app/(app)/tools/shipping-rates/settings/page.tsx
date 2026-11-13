import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireTool } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";
import { automaticZips, latestZipSuggestions } from "@/lib/shipping/runner";
import { ShippingSettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Shipping rates settings" };

export default async function ShippingSettingsPage() {
  const user = await requireTool(SHIPPING_TOOL);
  if (!user.can(SHIPPING_SETTINGS_PERMISSION)) {
    await logAudit({ action: "access.denied", category: "AUTH", actorId: user.id, actorEmail: user.email, success: false, metadata: { page: "shipping-rates/settings", permission: SHIPPING_SETTINGS_PERMISSION } });
    redirect("/tools/shipping-rates");
  }
  const s = await getSetting("shippingRates");
  const autoZips = automaticZips(s, await latestZipSuggestions());
  return (
    <ShippingSettingsClient
      autoZips={autoZips}
      initial={{
        origins: s.origins,
        upsAccounts: s.upsAccounts,
        upsRatingAccounts: s.upsRatingAccounts,
        quoteZips: s.quoteZips,
        uspsMaxLb: s.uspsMaxLb,
        upsMaxLb: s.upsMaxLb,
        mode: s.mode,
        ups: { clientId: s.ups.clientId, hasSecret: !!s.ups.encClientSecret, environment: s.ups.environment, apiVersion: s.ups.apiVersion },
        endicia: { requesterId: s.endicia.requesterId, accountId: s.endicia.accountId, hasPassPhrase: !!s.endicia.encPassPhrase, endpoint: s.endicia.endpoint },
        salsify: s.salsify,
      }}
    />
  );
}
