import Link from "next/link";
import { redirect } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getSessionUserId } from "@/lib/supabase/server";
import { getUserWorkspaceId } from "@/lib/workspaces";
import { PLANS, formatINR } from "@/lib/plans";
import {
  resolveEffectivePlan,
  type StoredSubscription,
} from "@/lib/billing/subscriptions";
import { isRazorpayConfigured } from "@/lib/billing/razorpay";
import { AppHeader } from "@/components/app-header";
import { SubscribeButtons } from "./SubscribeButtons";
import { CancelButton } from "./CancelButton";

export default async function BillingPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const workspaceId = await getUserWorkspaceId(userId);
  if (!workspaceId) redirect("/dashboard");

  const admin = getServiceSupabase();
  const { data: sub } = await admin!
    .from("subscriptions")
    .select("plan_code, status, billing_interval, current_period_end, override_reason, override_expires_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const stored = (sub ?? { plan_code: "free", status: "free" }) as StoredSubscription;
  const effective = resolveEffectivePlan(stored);
  const plan = PLANS[effective.plan];

  const month = new Date().toISOString().slice(0, 7);
  const { data: usage } = await admin!
    .from("usage_monthly")
    .select("completed_submissions, file_storage_bytes")
    .eq("workspace_id", workspaceId)
    .eq("month", `${month}-01`)
    .maybeSingle();
  const used = (usage ?? { completed_submissions: 0, file_storage_bytes: 0 }) as {
    completed_submissions: number;
    file_storage_bytes: number;
  };
  const { count: activeForms } = await admin!
    .from("forms")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "published");

  const e = plan.entitlements;
  const storageMb = Math.round((used.file_storage_bytes / 1024 / 1024) * 10) / 10;

  return (
    <>
      <AppHeader active="billing" />
      <main className="mx-auto max-w-3xl px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
        Billing & usage
      </p>
      <h1 className="mt-1 font-display text-3xl tracking-tight">
        {plan.name} plan
        {effective.source === "override" && (
          <span className="ml-2 align-middle rounded-full bg-amber-100 px-2.5 py-0.5 font-sans text-xs font-semibold text-amber-900">
            Admin override
          </span>
        )}
      </h1>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-ink/10 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint">Live forms</p>
          <p className="font-display text-2xl">
            {activeForms ?? 0}
            <span className="font-sans text-sm font-normal text-ink-faint"> / {e.maxActiveForms}</span>
          </p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint">Responses · {month}</p>
          <p className="font-display text-2xl">
            {(used.completed_submissions ?? 0).toLocaleString("en-IN")}
            <span className="font-sans text-sm font-normal text-ink-faint"> / {e.monthlySubmissions.toLocaleString("en-IN")}</span>
          </p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint">Storage</p>
          <p className="font-display text-2xl">
            {storageMb}
            <span className="font-sans text-sm font-normal text-ink-faint">
              {" "}MB / {e.storageBytes >= 1024 ** 3 ? `${e.storageBytes / 1024 ** 3} GB` : `${e.storageBytes / 1024 ** 2} MB`}
            </span>
          </p>
        </div>
      </div>

      <h2 className="mt-10 font-display text-2xl tracking-tight">Upgrade</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {formatINR(PLANS.starter.monthlyPaise)}/mo Starter · {formatINR(PLANS.pro.monthlyPaise)}/mo
        Pro. Downgrades keep every form, response, and file.
      </p>
      <div className="mt-4">
        <SubscribeButtons currentPlan={effective.plan} configured={isRazorpayConfigured()} />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-ink/10 pt-6">
        <CancelButton
          hasSubscription={Boolean(
            (stored as { status?: string }).status &&
              ["created", "authenticated", "active", "pending"].includes(
                (stored as { status: string }).status,
              ),
          )}
        />
        <Link href="/billing/credits" className="text-sm font-semibold text-brand-700 hover:text-brand-900">
          AI credits →
        </Link>
      </div>
      </main>
    </>
  );
}
