import type { Metadata } from "next";
import { requireUser } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <PageHeader title="My Profile" description="Update your name and password." />
      <ProfileForm name={user.name} email={user.email} role={user.roleName} />
    </div>
  );
}
