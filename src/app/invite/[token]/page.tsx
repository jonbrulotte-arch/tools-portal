import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { SetPasswordForm } from "@/components/set-password-form";
import { Alert } from "@/components/ui/alert";
import { findValidInvite } from "@/lib/tokens";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findValidInvite(token);
  if (!invite) {
    return (
      <AuthFrame title="Invitation unavailable">
        <Alert>This invitation link is invalid, has already been used or has expired. Ask an administrator to resend your invite.</Alert>
        <p className="mt-4 text-sm"><Link href="/login" className="text-blue-600 hover:underline">Back to sign in</Link></p>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="Activate your account">
      <SetPasswordForm endpoint="/api/public/invite" token={token} email={invite.user.email} initialName={invite.user.name} askName submitLabel="Activate account" />
    </AuthFrame>
  );
}
