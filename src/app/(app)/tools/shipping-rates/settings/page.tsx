import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireTool } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { savedHint } from "@/lib/saved-hint";
import { prisma } from "@/lib/prisma";
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
  // users with a saved Salsify key (candidates for whose key scheduled Products runs use)
  const keyUsers = (await prisma.userCredential.findMany({ where: { provider: "salsify", user: { status: "ACTIVE" } }, select: { user: { select: { id: true, name: true, email: true } } } })).map((c) => c.user);
  return (
    <ShippingSettingsClient
      autoZips={autoZips}
      keyUsers={keyUsers}
      initial={{
        origins: s.origins,
        upsAccounts: s.upsAccounts,
        upsRatingAccounts: s.upsRatingAccounts,
        quoteZips: s.quoteZips,
        uspsMaxLb: s.uspsMaxLb,
        upsMaxLb: s.upsMaxLb,
        mode: s.mode,
        // hints only: whether each account's credentials are saved and the client ID's last 4 characters
        upsCredentials: Object.fromEntries(Object.entries(s.upsCredentials).map(([a, c]) => [a, { clientId: savedHint(c.encClientId), hasSecret: !!c.encClientSecret }])),
        ups: { environment: s.ups.environment, apiVersion: s.ups.apiVersion },
        endicia: { requesterId: s.endicia.requesterId, accountId: s.endicia.accountId, hasPassPhrase: !!s.endicia.encPassPhrase, endpoint: s.endicia.endpoint },
        salsify: s.salsify,
        schedule: s.schedule,
        mangoImport: s.mangoImport,
        productRates: s.productRates,
        mangoInventory: s.mangoInventory,
        salsifyPush: s.salsifyPush,
      }}
    />
  );
}
