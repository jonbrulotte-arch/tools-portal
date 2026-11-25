import type { Metadata } from "next";
import { requirePermission } from "@/lib/rbac";
import { getSetting, logoUrl } from "@/lib/settings";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requirePermission("admin.settings");
  const [branding, email, security, backup] = await Promise.all([getSetting("branding"), getSetting("email"), getSetting("security"), getSetting("backup")]);
  return (
    <SettingsClient
      actorEmail={actor.email}
      branding={{ siteName: branding.siteName, accentWord: branding.accentWord, tagline: branding.tagline, logoUrl: logoUrl(branding) }}
      email={{
        tenantId: email.tenantId,
        clientId: email.clientId,
        senderAddress: email.senderAddress,
        senderName: email.senderName,
        hasSecret: !!email.encClientSecret || !!process.env.MS_GRAPH_CLIENT_SECRET,
        secretFromEnv: !email.encClientSecret && !!process.env.MS_GRAPH_CLIENT_SECRET,
      }}
      security={security}
      backup={backup}
    />
  );
}
