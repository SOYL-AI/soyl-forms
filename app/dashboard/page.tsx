import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSupabase, getSessionUserId } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { ensurePersonalWorkspace } from "@/lib/workspaces";
import { AppHeader } from "@/components/app-header";
import { FormRowActions, NewFormButton, ScanQrButton } from "./FormActions";

interface FormSummary {
  id: string;
  title: string;
  slug: string;
  status: string;
  updated_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Live",
  closed: "Closed",
  archived: "Archived",
};

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
          Dashboard
        </p>
        <h1 className="mt-1 font-display text-3xl tracking-tight">Almost there</h1>
        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-6">
          <h2 className="font-semibold text-amber-900">Backend not configured</h2>
          <p className="mt-2 text-sm leading-relaxed text-amber-900/80">
            Set <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> and{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code>, then run{" "}
            <code>supabase/migrations/0001_init.sql</code> in your Supabase SQL
            editor. This page becomes your form list.
          </p>
        </div>
        <p className="mt-6 text-sm text-ink-soft">
          Meanwhile:{" "}
          <Link href="/f/demo" className="font-semibold text-ink underline underline-offset-2">
            answer the demo form
          </Link>
          .
        </p>
      </main>
    );
  }

  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  let workspaceId: string;
  try {
    ({ workspaceId } = await ensurePersonalWorkspace(userId));
  } catch (e) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16">
        <h1 className="font-display text-3xl tracking-tight">Couldn&apos;t load your workspace</h1>
        <p className="mt-3 text-sm text-ink-soft">
          {(e as Error).message} Check that migration{" "}
          <code>0001_init.sql</code> has been run.
        </p>
      </main>
    );
  }

  const supabase = getServerSupabase();
  const { data } = await supabase!
    .from("forms")
    .select("id, title, slug, status, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  const forms = ((data ?? []) as FormSummary[]).filter((f) => f.status !== "archived");
  const archived = ((data ?? []) as FormSummary[]).filter((f) => f.status === "archived");

  const counts = new Map<string, number>();
  await Promise.all(
    forms.map(async (f) => {
      const { count } = await supabase!
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("form_id", f.id)
        .is("deleted_at", null);
      counts.set(f.id, count ?? 0);
    }),
  );

  return (
    <>
      <AppHeader active="forms" />
      <main className="mx-auto max-w-3xl px-5 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
            Dashboard
          </p>
          <h1 className="mt-1 font-display text-3xl tracking-tight">Your forms</h1>
        </div>
        <div className="flex items-center gap-2">
          <ScanQrButton />
          <Link
            href="/ai/new"
            className="rounded-full border border-ink/15 bg-white px-6 py-2.5 text-sm font-semibold transition-colors hover:border-ink/30"
          >
            Create with AI
          </Link>
          <NewFormButton />
        </div>
      </div>

      {forms.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-ink/10 bg-paper p-8 text-center">
          <p className="text-lg font-semibold">No forms yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
            Create your first form above — you&apos;ll get a visual builder
            with live preview and autosave.
          </p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white">
          {forms.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold">
                  <span className="truncate">{f.title}</span>
                  <span className="shrink-0 rounded-full bg-paper-deep px-2.5 py-0.5 text-[11px] font-semibold text-ink-soft">
                    {STATUS_LABEL[f.status] ?? f.status}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  Updated {new Date(f.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  {" · "}
                  <Link href={`/forms/${f.id}/responses`} className="font-semibold text-ink-soft underline underline-offset-2">
                    {counts.get(f.id) ?? 0} responses
                  </Link>
                  {f.status === "published" && (
                    <>
                      {" · "}
                      <Link href={`/f/${f.slug}`} className="font-semibold text-brand-700">
                        View live
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <FormRowActions id={f.id} title={f.title} archived={false} />
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-ink-soft">
            Archived ({archived.length})
          </summary>
          <ul className="mt-3 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white">
            {archived.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <p className="font-medium text-ink-soft">{f.title}</p>
                <FormRowActions id={f.id} title={f.title} archived />
              </li>
            ))}
          </ul>
        </details>
      )}
      </main>
    </>
  );
}
