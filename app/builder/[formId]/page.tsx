import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSupabase, getSessionUserId } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { formSchemaV1 } from "@/lib/forms/schema";
import { getWorkspacePlan } from "@/lib/billing/plan";
import { listBrandKitSummaries } from "@/lib/brand/actions";
import type { FormSettings, FormTheme } from "@/types/forms";
import { ConfigRequired } from "@/components/app/ConfigRequired";
import BuilderClient from "./BuilderClient";

export const metadata: Metadata = { title: "Builder", robots: { index: false } };

export default async function BuilderPage({ params }: { params: { formId: string } }) {
  if (!isSupabaseConfigured()) return <ConfigRequired area="the builder" />;
  const userId = await getSessionUserId();
  if (!userId) redirect(`/login?next=/builder/${params.formId}`);

  const supabase = getServerSupabase();
  const { data } = await supabase!
    .from("forms")
    .select("id, workspace_id, title, slug, status, draft_schema, draft_revision, theme, settings, published_version_id")
    .eq("id", params.formId)
    .maybeSingle();
  // RLS scopes reads to workspace members; anything else is a 404.
  if (!data) notFound();
  const row = data as {
    id: string;
    workspace_id: string;
    title: string;
    slug: string;
    status: string;
    draft_schema: unknown;
    draft_revision: number;
    theme: unknown;
    settings: unknown;
    published_version_id: string | null;
  };

  const parsed = formSchemaV1.safeParse(row.draft_schema);
  if (!parsed.success) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16">
        <h1 className="font-display text-3xl tracking-tight">Couldn&apos;t open this form</h1>
        <p className="mt-3 text-sm text-ink-soft">
          Its saved draft failed validation. Duplicate a working form or contact support to repair it.
        </p>
      </main>
    );
  }

  const [plan, brandKits, version] = await Promise.all([
    getWorkspacePlan(row.workspace_id),
    listBrandKitSummaries(row.workspace_id),
    row.published_version_id
      ? getServiceSupabase()!
          .from("form_versions")
          .select("version_number")
          .eq("id", row.published_version_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <BuilderClient
      formId={row.id}
      status={row.status}
      initialTitle={row.title}
      initialSchema={parsed.data}
      initialRevision={row.draft_revision}
      initialTheme={(row.theme ?? {}) as FormTheme}
      initialSettings={(row.settings ?? {}) as FormSettings}
      slug={row.slug}
      brandKits={brandKits}
      plan={plan}
      publishedVersion={(version.data as { version_number: number } | null)?.version_number ?? null}
    />
  );
}
