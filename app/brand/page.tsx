import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/app-context";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { listBrandKits } from "@/lib/brand/actions";
import { isAiConfigured } from "@/lib/ai/client";
import { isR2Configured } from "@/lib/r2";
import { ensureMonthlyCredits, getAiBalance } from "@/lib/ai/credits";
import { AppShell } from "@/components/app/AppShell";
import { ConfigRequired } from "@/components/app/ConfigRequired";
import { PageHeader } from "@/components/ui/card";
import { BrandStudio } from "./BrandStudio";

export const metadata: Metadata = { title: "Brand kit", robots: { index: false } };

export default async function BrandPage(props: { searchParams?: Promise<{ new?: string }> }) {
  const searchParams = await props.searchParams;
  if (!isSupabaseConfigured()) return <ConfigRequired area="your brand kits" />;
  const res = await getAppContext();
  if (!res.ok) redirect(res.reason === "signed-out" ? "/login?next=/brand" : "/dashboard");
  const { ctx } = res;
  await ensureMonthlyCredits(ctx.workspaceId, ctx.plan);
  const [kits, balance] = await Promise.all([listBrandKits(ctx.workspaceId), getAiBalance(ctx.workspaceId)]);

  return (
    <AppShell ctx={ctx} active="brand">
      <PageHeader
        eyebrow="Brand kit"
        title="Your brand, on every form"
        description="Add your logo, brand guidelines or website once. Every form and AI draft then uses your colours, fonts and tone."
      />
      <div className="mt-8">
        <BrandStudio
          kits={kits}
          plan={ctx.plan}
          aiConfigured={isAiConfigured() && ctx.flags.aiEnabled}
          uploadsAvailable={isR2Configured() && ctx.flags.uploadsEnabled}
          balance={balance}
          startNew={searchParams?.new === "1"}
        />
      </div>
    </AppShell>
  );
}
