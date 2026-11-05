import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { SetPasswordForm } from "@/components/set-password-form";
import { Alert } from "@/components/ui/alert";
import { findValidReset } from "@/lib/tokens";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reset = await findValidReset(token);
  if (!reset) {
    return (
      <AuthFrame title="Link expired">
        <Alert>This reset link is invalid or has expired.</Alert>
        <p className="mt-4 text-sm"><Link href="/forgot-password" className="text-blue-600 hover:underline">Request a new link</Link></p>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="Choose a new password">
      <SetPasswordForm endpoint="/api/public/reset-password" token={token} email={reset.user.email} submitLabel="Set password" />
    </AuthFrame>
  );
}
