import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAppContext } from "@/lib/app-context";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { AI_COST_PER_BRAND_EXTRACTION, AI_COST_PER_DRAFT, AI_CREDIT_PACKS, PLANS } from "@/lib/plans";
import { ensureMonthlyCredits, getAiBalance } from "@/lib/ai/credits";
import { isRazorpayConfigured } from "@/lib/billing/razorpay";
import { AppShell } from "@/components/app/AppShell";
import { ConfigRequired } from "@/components/app/ConfigRequired";
import { PageHeader } from "@/components/ui/card";
import { BuyButtons } from "./BuyButtons";

export const metadata: Metadata = { title: "AI credits", robots: { index: false } };

export default async function CreditsPage() {
  if (!isSupabaseConfigured()) return <ConfigRequired area="AI credits" />;
  const res = await getAppContext();
  if (!res.ok) redirect("/login?next=/billing/credits");
  const { ctx } = res;
  await ensureMonthlyCredits(ctx.workspaceId, ctx.plan);
  const balance = await getAiBalance(ctx.workspaceId);

  return (
    <AppShell ctx={ctx} active="billing">
      <Link href="/billing" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Billing
      </Link>
      <PageHeader
        className="mt-3"
        eyebrow="AI credits"
        title={`${balance} credit${balance === 1 ? "" : "s"} available`}
        description={`Your ${PLANS[ctx.plan].name} plan adds ${PLANS[ctx.plan].entitlements.aiCreditsMonthly} credits every month. A form draft costs ${AI_COST_PER_DRAFT}; a brand extraction costs ${AI_COST_PER_BRAND_EXTRACTION}. Packs are one-time and never expire.`}
      />
      <div className="mt-8">
        <BuyButtons packs={AI_CREDIT_PACKS} configured={isRazorpayConfigured() && ctx.flags.upgradesEnabled} />
      </div>
      <p className="mt-6 max-w-xl text-xs leading-relaxed text-ink-faint">
        One-time payments via Razorpay (UPI, cards, netbanking). Credits are tied to your workspace and are only spent when a draft or extraction actually succeeds.
      </p>
    </AppShell>
  );
}
