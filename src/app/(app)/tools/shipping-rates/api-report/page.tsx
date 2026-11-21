import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireTool } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";
import { apiUsageReport } from "@/lib/shipping/api-report";
import { flushApiUsage } from "@/lib/shipping/api-usage";
import { ApiReportClient } from "./api-report-client";

export const metadata: Metadata = { title: "API report" };

export default async function ApiReportPage() {
  const user = await requireTool(SHIPPING_TOOL);
  if (!user.can(SHIPPING_SETTINGS_PERMISSION)) {
    await logAudit({ action: "access.denied", category: "AUTH", actorId: user.id, actorEmail: user.email, success: false, metadata: { page: "shipping-rates/api-report", permission: SHIPPING_SETTINGS_PERMISSION } });
    redirect("/tools/shipping-rates");
  }
  await flushApiUsage();
  const s = await getSetting("shippingRates");
  return <ApiReportClient initial={await apiUsageReport(s, { days: 30 })} mode={s.mode} />;
}
