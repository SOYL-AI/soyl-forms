import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getAppContext } from "@/lib/app-context";
import { PLANS, formatINR, isPlanCode, type BillingInterval, type PlanCode } from "@/lib/plans";
import { resolveEffectivePlan, type StoredSubscription } from "@/lib/billing/subscriptions";
import { isRazorpayConfigured } from "@/lib/billing/razorpay";
import { getAiBalance } from "@/lib/ai/credits";
import { AppShell } from "@/components/app/AppShell";
import { ConfigRequired } from "@/components/app/ConfigRequired";
import { Card, PageHeader } from "@/components/ui/card";
import { Meter } from "@/components/ui/meter";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { formatBytes, formatDate } from "@/lib/utils";
import { SubscribeButtons } from "./SubscribeButtons";
import { CancelButton } from "./CancelButton";

export const metadata: Metadata = { title: "Billing & usage", robots: { index: false } };

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: { plan?: string; interval?: string; checkout?: string };
}) {
  if (!isSupabaseConfigured()) return <ConfigRequired area="billing" />;
  const res = await getAppContext();
  if (!res.ok) redirect("/login?next=/billing");
  const { ctx } = res;
  const admin = getServiceSupabase()!;

  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan_code, status, billing_interval, current_period_end, cancel_at_period_end, override_reason, override_expires_at")
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  const stored = (sub ?? { plan_code: "free", status: "free" }) as StoredSubscription & {
    billing_interval?: string | null;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean;
  };
  const effective = resolveEffectivePlan(stored);
  const plan = PLANS[effective.plan];

  const month = new Date().toISOString().slice(0, 7);
  const [{ data: usage }, { count: activeForms }, { data: files }, credits] = await Promise.all([
    admin.from("usage_monthly").select("completed_submissions, notification_emails").eq("workspace_id", ctx.workspaceId).eq("month", `${month}-01`).maybeSingle(),
    admin.from("forms").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspaceId).eq("status", "published"),
    admin.from("uploaded_files").select("size_bytes").eq("workspace_id", ctx.workspaceId).neq("status", "deleted").limit(5000),
    getAiBalance(ctx.workspaceId),
  ]);
  const used = (usage ?? { completed_submissions: 0, notification_emails: 0 }) as { completed_submissions: number; notification_emails: number };
  const storage = ((files ?? []) as Array<{ size_bytes: number }>).reduce((s, f) => s + f.size_bytes, 0);
  const e = plan.entitlements;

  const wantPlan: PlanCode | null = searchParams?.plan && isPlanCode(searchParams.plan) && searchParams.plan !== "free" ? searchParams.plan : null;
  const wantInterval: BillingInterval = searchParams?.interval === "yearly" ? "yearly" : "monthly";
  const autoOpen = Boolean(wantPlan && searchParams?.checkout === "1" && effective.plan !== wantPlan);
  const hasLiveSub = ["created", "authenticated", "active", "pending"].includes(stored.status);

  return (
    <AppShell ctx={ctx} active="billing">
      <PageHeader eyebrow="Billing & usage" title={`${plan.name} plan`} description={plan.tagline} />

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={stored.status} />
            {effective.source === "override" && <Badge tone="warn">Admin override until {formatDate(stored.override_expires_at ?? "")}</Badge>}
            {stored.cancel_at_period_end && <Badge tone="neutral">Cancels at period end</Badge>}
            {stored.billing_interval && <span className="text-xs text-ink-faint">Billed {stored.billing_interval}</span>}
            {stored.current_period_end && <span className="text-xs text-ink-faint">· renews {formatDate(stored.current_period_end)}</span>}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Meter label="Live forms" used={activeForms ?? 0} limit={e.maxActiveForms} />
            <Meter label="Responses this month" used={used.completed_submissions ?? 0} limit={e.monthlySubmissions} />
            <Meter label="File storage" used={storage} limit={e.storageBytes} format={formatBytes} />
            {e.emailNotifications ? (
              <Meter label="Notification emails" used={used.notification_emails ?? 0} limit={e.monthlyNotificationEmails} />
            ) : (
              <div>
                <p className="text-xs font-semibold text-ink-soft">Notification emails</p>
                <p className="mt-1 text-xs text-ink-faint">Included from Starter.</p>
              </div>
            )}
          </div>
        </Card>
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">AI credits</p>
          <p className="mt-1 font-display text-3xl tracking-tight">
            {credits}
            <span className="ml-1.5 align-middle font-sans text-sm font-normal text-ink-faint">available</span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {e.aiCreditsMonthly} credits arrive every month on {plan.name}. A draft costs 1, a brand extraction 2. Packs never expire.
          </p>
          <Link href="/billing/credits" className="mt-3 inline-block text-sm font-semibold text-ink underline underline-offset-2">
            Buy a credit pack →
          </Link>
        </Card>
      </div>

      <h2 className="mt-12 font-display text-2xl tracking-tight">{effective.plan === "free" ? "Upgrade" : "Change plan"}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {formatINR(PLANS.starter.monthlyPaise)}/mo Starter · {formatINR(PLANS.pro.monthlyPaise)}/mo Pro. Paid access activates when Razorpay confirms — usually seconds. Downgrades keep every form, response and file.
      </p>
      {!ctx.flags.upgradesEnabled && (
        <Notice tone="warn" className="mt-4">
          Upgrades are paused right now. Your current plan continues as normal.
        </Notice>
      )}
      <div className="mt-5">
        <SubscribeButtons
          currentPlan={effective.plan}
          configured={isRazorpayConfigured() && ctx.flags.upgradesEnabled}
          initialInterval={wantInterval}
          autoOpenPlan={autoOpen ? wantPlan : null}
        />
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <CancelButton hasSubscription={hasLiveSub && !stored.cancel_at_period_end} />
        <Link href="/contact" className="text-sm font-semibold text-ink-soft hover:text-ink">
          Need an invoice or a custom plan? Contact us
        </Link>
      </div>
    </AppShell>
  );
}
