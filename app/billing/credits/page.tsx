import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/supabase/server";
import { AI_CREDIT_PACKS, AI_FREE_MONTHLY_CREDITS } from "@/lib/plans";
import { getAiBalance, getUserWorkspaceId } from "@/lib/workspaces";
import { BuyButtons } from "./BuyButtons";

export default async function CreditsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const workspaceId = await getUserWorkspaceId(userId);
  if (!workspaceId) redirect("/dashboard");
  const balance = await getAiBalance(workspaceId);

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
        AI credits
      </p>
      <h1 className="mt-1 font-display text-3xl tracking-tight">
        Balance: {balance} credit{balance === 1 ? "" : "s"}
      </h1>
      <p className="mt-2 max-w-xl text-ink-soft">
        Each AI-generated draft costs 1 credit. Workspaces get{" "}
        {AI_FREE_MONTHLY_CREDITS} free credits every month — top up only when
        you run dry.
      </p>
      <div className="mt-8">
        <BuyButtons packs={AI_CREDIT_PACKS} />
      </div>
      <p className="mt-6 text-xs leading-relaxed text-ink-faint">
        One-time payments via Razorpay (UPI, cards, netbanking). Credits never
        expire and are tied to your workspace. Use test mode keys to try the
        flow without real money.
      </p>
    </main>
  );
}
