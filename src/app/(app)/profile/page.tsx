import type { Metadata } from "next";
import { requireUser } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { credentialStatus, CREDENTIAL_PROVIDERS } from "@/lib/user-credentials";
import { ProfileForm } from "./profile-form";
import { SalsifyKeyCard } from "./credentials-card";

export const metadata: Metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const showSalsify = user.canUseTool(CREDENTIAL_PROVIDERS.salsify.tool);
  const creds = showSalsify ? await credentialStatus(user.id) : {};
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <PageHeader title="My Profile" description={showSalsify ? "Update your name, password and your own API keys." : "Update your name and password."} />
      <ProfileForm name={user.name} email={user.email} role={user.roleName} />
      {showSalsify && <SalsifyKeyCard savedAt={creds.salsify?.updatedAt ?? null} />}
    </div>
  );
}
