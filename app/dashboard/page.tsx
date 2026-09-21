import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, LayoutGrid, Sparkles } from "lucide-react";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getAppContext } from "@/lib/app-context";
import { ensureMonthlyCredits, getAiBalance } from "@/lib/ai/credits";
import { AppShell } from "@/components/app/AppShell";
import { ConfigRequired } from "@/components/app/ConfigRequired";
import { Card, PageHeader } from "@/components/ui/card";
import { Meter } from "@/components/ui/meter";
import { EmptyState } from "@/components/ui/empty";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { formatBytes } from "@/lib/utils";
import { FormCard, NewFormButton } from "./FormActions";

export const metadata: Metadata = { title: "Your forms", robots: { index: false } };

export interface FormSummary {
  id: string;
  title: string;
  slug: string;
  status: string;
  updated_at: string;
  published_at: string | null;
  brand_kit_id: string | null;
}

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) return <ConfigRequired area="your form list" />;
  const res = await getAppContext();
  if (!res.ok) {
    if (res.reason === "signed-out") redirect("/login?next=/dashboard");
    if (res.reason === "registrations-paused") {
      return (
        <main className="mx-auto max-w-xl px-5 py-24">
          <Notice tone="warn" title="New sign-ups are paused">
            We&apos;re not provisioning new workspaces right now. Your account exists — check back soon or contact support.
          </Notice>
        </main>
      );
    }
    return (
      <main className="mx-auto max-w-xl px-5 py-24">
        <Notice tone="danger" title="Couldn't load your workspace">
          {res.message} Check that the migrations in <code>supabase/migrations</code> have been run.
        </Notice>
      </main>
    );
  }
  const { ctx } = res;
  const admin = getServiceSupabase()!;
  const month = new Date().toISOString().slice(0, 7);

  await ensureMonthlyCredits(ctx.workspaceId, ctx.plan);
  const [{ data: formRows }, { data: subs }, { data: usage }, { data: files }, credits] = await Promise.all([
    admin
      .from("forms")
      .select("id, title, slug, status, updated_at, published_at, brand_kit_id")
      .eq("workspace_id", ctx.workspaceId)
      .order("updated_at", { ascending: false }),
    admin.from("submissions").select("form_id, submitted_at").eq("workspace_id", ctx.workspaceId).is("deleted_at", null).limit(10000),
    admin.from("usage_monthly").select("completed_submissions").eq("workspace_id", ctx.workspaceId).eq("month", `${month}-01`).maybeSingle(),
    admin.from("uploaded_files").select("size_bytes").eq("workspace_id", ctx.workspaceId).neq("status", "deleted").limit(5000),
    getAiBalance(ctx.workspaceId),
  ]);

  const all = (formRows ?? []) as FormSummary[];
  const forms = all.filter((f) => f.status !== "archived");
  const archived = all.filter((f) => f.status === "archived");
  const live = forms.filter((f) => f.status === "published").length;

  const total = new Map<string, number>();
  const thisMonth = new Map<string, number>();
  for (const s of (subs ?? []) as Array<{ form_id: string; submitted_at: string }>) {
    total.set(s.form_id, (total.get(s.form_id) ?? 0) + 1);
    if (s.submitted_at.startsWith(month)) thisMonth.set(s.form_id, (thisMonth.get(s.form_id) ?? 0) + 1);
  }
  const monthlyUsed = (usage as { completed_submissions: number } | null)?.completed_submissions ?? 0;
  const storageUsed = ((files ?? []) as Array<{ size_bytes: number }>).reduce((s, f) => s + f.size_bytes, 0);
  const e = ctx.entitlements;
  const nearLimit = monthlyUsed / e.monthlySubmissions >= 0.8 || live / e.maxActiveForms >= 0.8;

  return (
    <AppShell ctx={ctx} active="forms">
      <PageHeader
        eyebrow={ctx.workspaceName}
        title="Your forms"
        actions={
          <>
            <ButtonLink href="/create" variant="secondary">
              <Sparkles className="h-4 w-4" /> Create with AI
            </ButtonLink>
            <NewFormButton />
          </>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card className="!p-4">
          <Meter label="Live forms" used={live} limit={e.maxActiveForms} />
        </Card>
        <Card className="!p-4">
          <Meter label={`Responses · ${new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`} used={monthlyUsed} limit={e.monthlySubmissions} />
        </Card>
        <Card className="!p-4">
          <Meter label="File storage" used={storageUsed} limit={e.storageBytes} format={formatBytes} />
        </Card>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
        <span>
          {credits} AI credit{credits === 1 ? "" : "s"} available ·{" "}
          <Link href="/billing/credits" className="font-semibold text-ink-soft underline underline-offset-2 hover:text-ink">
            top up
          </Link>
        </span>
        {nearLimit && ctx.plan !== "pro" && (
          <Link href="/billing" className="font-semibold text-warn underline underline-offset-2">
            You&apos;re close to a limit — see plans
          </Link>
        )}
      </div>

      {forms.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<FileText className="h-5 w-5" />}
          title="No forms yet"
          description="Describe one and let the AI draft it in your brand, start from a template, or build from scratch."
          action={
            <>
              <ButtonLink href="/create" variant="accent">
                <Sparkles className="h-4 w-4" /> Create with AI
              </ButtonLink>
              <ButtonLink href="/templates" variant="secondary">
                <LayoutGrid className="h-4 w-4" /> Templates
              </ButtonLink>
              <NewFormButton variant="ghost" label="Blank form" />
            </>
          }
        />
      ) : (
        <ul className="mt-8 grid gap-3 md:grid-cols-2">
          {forms.map((f) => (
            <FormCard key={f.id} form={f} total={total.get(f.id) ?? 0} thisMonth={thisMonth.get(f.id) ?? 0} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <details className="mt-10">
          <summary className="cursor-pointer text-sm font-semibold text-ink-soft">Archived ({archived.length})</summary>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {archived.map((f) => (
              <FormCard key={f.id} form={f} total={total.get(f.id) ?? 0} thisMonth={thisMonth.get(f.id) ?? 0} archived />
            ))}
          </ul>
        </details>
      )}
    </AppShell>
  );
}
