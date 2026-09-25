import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { getProductName } from "@/lib/config";
import { AdminNav } from "./AdminNav";

export const metadata: Metadata = { title: { default: "Operator console", template: "%s · Operator console" }, robots: { index: false } };

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const gate = await requireAdmin();
  if (!gate.ok && gate.reason === "signed-out") redirect("/login?next=/super-admin");
  if (!gate.ok) {
    return (
      <main className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-3xl tracking-tight">Not allowed here</h1>
        <p className="mt-2 text-sm text-ink-soft">This console is for platform operators. Regular accounts get a 403 — by design.</p>
        <p className="mt-6">
          <Link href="/dashboard" className="text-sm font-semibold underline underline-offset-2">
            Back to your forms
          </Link>
        </p>
      </main>
    );
  }
  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <AdminNav role={gate.role} productName={getProductName()} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[88rem] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
