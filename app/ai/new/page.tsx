import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/supabase/server";
import { getAiBalance, getUserWorkspaceId } from "@/lib/workspaces";
import { AiGenerator } from "./AiGenerator";

export default async function AiNewPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const workspaceId = await getUserWorkspaceId(userId);
  if (!workspaceId) redirect("/dashboard");
  const balance = await getAiBalance(workspaceId);

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
        Create with AI
      </p>
      <h1 className="mt-1 font-display text-3xl tracking-tight">
        Dictate it. We&apos;ll draft it.
      </h1>
      <p className="mt-2 text-ink-soft">
        Describe the form in plain words — the draft appears in your builder,
        where every question stays editable.
      </p>
      <div className="mt-6">
        <AiGenerator initialBalance={balance} />
      </div>
    </main>
  );
}
