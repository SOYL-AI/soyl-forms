import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/app-context";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getSupportEmail } from "@/lib/config";
import { AppShell } from "@/components/app/AppShell";
import { ConfigRequired } from "@/components/app/ConfigRequired";
import { Card, PageHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { AccountForms } from "./AccountForms";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage({ searchParams }: { searchParams?: { reset?: string } }) {
  if (!isSupabaseConfigured()) return <ConfigRequired area="your account" />;
  const res = await getAppContext();
  if (!res.ok) redirect("/login?next=/account");
  const { ctx } = res;

  return (
    <AppShell ctx={ctx} active="account">
      <PageHeader eyebrow="Account" title="Settings" description="Your profile, workspace and sign-in." />
      {searchParams?.reset === "1" && (
        <Notice tone="info" className="mt-6">
          You arrived from a password-reset link — set a new password below.
        </Notice>
      )}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <AccountForms
          email={ctx.email}
          displayName={ctx.displayName}
          workspaceId={ctx.workspaceId}
          workspaceName={ctx.workspaceName}
          showPassword={searchParams?.reset === "1"}
        />
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Data & deletion</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Export any form&apos;s responses as CSV from its Responses page. To delete your account and workspace permanently, email{" "}
            <a href={`mailto:${getSupportEmail()}`} className="font-semibold text-ink underline underline-offset-2">
              {getSupportEmail()}
            </a>{" "}
            from this address — we confirm before anything is removed.
          </p>
          <p className="mt-4 text-sm text-ink-soft">
            Plan and invoices live under{" "}
            <Link href="/billing" className="font-semibold text-ink underline underline-offset-2">
              Billing
            </Link>
            .
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
