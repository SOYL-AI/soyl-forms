import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Create your account", robots: { index: false } };

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Free for 2 live forms and 250 responses a month. No card. Your first form is minutes away."
    >
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthShell>
  );
}
