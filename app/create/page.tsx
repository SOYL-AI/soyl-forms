import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/app-context";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { listBrandKitSummaries } from "@/lib/brand/actions";
import { isAiConfigured } from "@/lib/ai/client";
import { ensureMonthlyCredits, getAiBalance } from "@/lib/ai/credits";
import { AppShell } from "@/components/app/AppShell";
import { ConfigRequired } from "@/components/app/ConfigRequired";
import { PageHeader } from "@/components/ui/card";
import { AiStudio } from "./AiStudio";

export const metadata: Metadata = { title: "Create with AI", robots: { index: false } };

export default async function CreatePage({ searchParams }: { searchParams?: { kit?: string } }) {
  if (!isSupabaseConfigured()) return <ConfigRequired area="AI Studio" />;
  const res = await getAppContext();
  if (!res.ok) redirect(res.reason === "signed-out" ? "/login?next=/create" : "/dashboard");
  const { ctx } = res;
  await ensureMonthlyCredits(ctx.workspaceId, ctx.plan);
  const [kits, balance] = await Promise.all([listBrandKitSummaries(ctx.workspaceId), getAiBalance(ctx.workspaceId)]);
  const requested = searchParams?.kit && kits.some((k) => k.id === searchParams.kit) ? searchParams.kit : null;
  const initialKitId = requested ?? kits.find((k) => k.isDefault)?.id ?? kits[0]?.id ?? null;

  return (
    <AppShell ctx={ctx} active="create" wide>
      <PageHeader
        eyebrow="Create with AI"
        title="Describe it. We’ll draft it in your brand."
        description="Say who’s answering and what you need to know. You get a complete, on-brand form to click through — then open it in the builder to fine-tune and publish."
      />
      <div className="mt-8">
        <AiStudio kits={kits} initialKitId={initialKitId} balance={balance} aiConfigured={isAiConfigured() && ctx.flags.aiEnabled} />
      </div>
    </AppShell>
  );
}
