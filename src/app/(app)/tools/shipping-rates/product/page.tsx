import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { credentialStatus } from "@/lib/user-credentials";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";
import { ProductQuoteClient } from "./product-client";

export const metadata: Metadata = { title: "Product shipping quote" };

export default async function ProductQuotePage() {
  const user = await requireTool(SHIPPING_TOOL);
  const [s, creds, runs] = await Promise.all([
    getSetting("shippingRates"),
    credentialStatus(user.id),
    prisma.shippingQuoteRun.findMany({ where: { status: "READY" }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, mode: true, createdAt: true } }),
  ]);
  return (
    <ProductQuoteClient
      mode={s.mode}
      origins={s.origins}
      hasKey={!!creds.salsify}
      orgSet={!!s.salsify.orgId}
      canManageSettings={user.can(SHIPPING_SETTINGS_PERMISSION)}
      runs={runs.map((r) => ({ id: r.id, label: `${r.createdAt.toISOString().slice(0, 16).replace("T", " ")} · ${r.mode === "live" ? "live" : "simulated"}` }))}
    />
  );
}
