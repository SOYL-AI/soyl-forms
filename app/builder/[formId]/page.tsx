import { notFound, redirect } from "next/navigation";
import { getServerSupabase, getSessionUserId } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { formSchemaV1 } from "@/lib/forms/schema";
import type { FormSettings, FormTheme } from "@/types/forms";
import BuilderClient from "./BuilderClient";

export default async function BuilderPage({
  params,
}: {
  params: { formId: string };
}) {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16">
        <h1 className="font-display text-3xl tracking-tight">Builder unavailable</h1>
        <p className="mt-3 text-sm text-ink-soft">
          Supabase isn&apos;t configured in this environment. Set the keys in{" "}
          <code>.env</code> to edit forms.
        </p>
      </main>
    );
  }
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const supabase = getServerSupabase();
  const { data } = await supabase!
    .from("forms")
    .select("id, title, slug, status, draft_schema, draft_revision, theme, settings")
    .eq("id", params.formId)
    .maybeSingle();
  // RLS scopes reads to workspace members; anything else is a 404.
  if (!data) notFound();
  const row = data as {
    id: string;
    title: string;
    slug: string;
    status: string;
    draft_schema: unknown;
    draft_revision: number;
    theme: unknown;
    settings: unknown;
  };

  const parsed = formSchemaV1.safeParse(row.draft_schema);
  if (!parsed.success) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16">
        <h1 className="font-display text-3xl tracking-tight">Couldn&apos;t open this form</h1>
        <p className="mt-3 text-sm text-ink-soft">
          Its saved draft failed validation. Publishing is blocked until the
          draft is repaired.
        </p>
      </main>
    );
  }

  const theme = (row.theme ?? {}) as FormTheme;
  const settings = (row.settings ?? {}) as FormSettings;
  return (
    <BuilderClient
      formId={row.id}
      status={row.status}
      initialTitle={row.title}
      initialSchema={parsed.data}
      initialRevision={row.draft_revision}
      initialTheme={theme}
      initialSettings={settings}
      slug={row.slug}
    />
  );
}
