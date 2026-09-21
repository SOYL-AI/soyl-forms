import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotForm } from "./ForgotForm";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPage() {
  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we'll send a link to choose a new password.">
      <ForgotForm />
    </AuthShell>
  );
}
