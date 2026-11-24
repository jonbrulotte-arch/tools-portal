import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { PACKAGING_SETTINGS_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { jobStatus } from "@/lib/packaging/jobs";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Packaging Configurator settings" };

export default async function PackagingSettingsPage() {
  const user = await requireTool(PACKAGING_TOOL);
  if (!user.can(PACKAGING_SETTINGS_PERMISSION)) {
    await logAudit({ action: "access.denied", category: "AUTH", actorId: user.id, actorEmail: user.email, success: false, metadata: { page: "packaging-configurator/settings", permission: PACKAGING_SETTINGS_PERMISSION } });
    redirect("/tools/packaging-configurator");
  }
  const [s, shipping, status, keyUsers, ownKey] = await Promise.all([
    getSetting("packagingConfigurator"),
    getSetting("shippingRates"),
    jobStatus(),
    prisma.userCredential.findMany({ where: { provider: "salsify", user: { status: "ACTIVE" } }, select: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.userCredential.findUnique({ where: { userId_provider: { userId: user.id, provider: "salsify" } }, select: { updatedAt: true } }),
  ]);
  return <SettingsClient initial={s} shippingOrgId={shipping.salsify.orgId} keyUsers={keyUsers.map((k) => k.user)} status={status} hasOwnKey={!!ownKey} />;
}
