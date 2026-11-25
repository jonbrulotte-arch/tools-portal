import type { Metadata } from "next";
import { AuthFrame } from "@/components/auth-frame";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <AuthFrame title="Reset your password">
      <ForgotForm />
    </AuthFrame>
  );
}
