import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getAppContext } from "@/lib/app-context";
import { getFormForOwner } from "@/lib/forms/actions";
import { formSchemaV1 } from "@/lib/forms/schema";
import { displayAnswer } from "@/lib/forms/answers";
import { isAnswerable } from "@/lib/forms/logic";
import { BLOCK_ICONS } from "@/lib/forms/blockIcons";
import type { AnswerValue, Block } from "@/types/forms";
import { AppShell } from "@/components/app/AppShell";
import { ConfigRequired } from "@/components/app/ConfigRequired";
import { FormSubnav } from "@/components/app/FormSubnav";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Response", robots: { index: false } };

export default async function ResponseDetailPage({ params }: { params: { formId: string; submissionId: string } }) {
  if (!isSupabaseConfigured()) return <ConfigRequired area="responses" />;
  const res = await getAppContext();
  if (!res.ok) redirect("/login");
  const owned = await getFormForOwner(params.formId);
  if ("error" in owned) redirect("/dashboard");
  const form = owned.form;
  const admin = getServiceSupabase()!;

  const { data: sub } = await admin
    .from("submissions")
    .select("id, submitted_at, source, duration_ms, form_version_id, answers, hidden_fields")
    .eq("id", params.submissionId)
    .eq("form_id", form.id)
    .is("deleted_at", null)
    .maybeSingle();
  const submission = sub as {
    id: string;
    submitted_at: string;
    source: string | null;
    duration_ms: number | null;
    form_version_id: string;
    answers: Record<string, AnswerValue>;
    hidden_fields: Record<string, string>;
  } | null;
  if (!submission) notFound();

  // The exact version this respondent answered (history never rewrites).
  const { data: version } = await admin.from("form_versions").select("schema, version_number").eq("id", submission.form_version_id).maybeSingle();
  const parsed = formSchemaV1.safeParse((version as { schema: unknown } | null)?.schema);
  const blocks: Block[] = parsed.success ? parsed.data.blocks.filter((b) => isAnswerable(b.type)) : [];
  const versionNumber = (version as { version_number: number } | null)?.version_number;
  const hidden = Object.entries(submission.hidden_fields ?? {});

  return (
    <AppShell ctx={res.ctx} active="forms">
      <FormSubnav formId={form.id} title={form.title} status={form.status} slug={form.slug} active="responses" />
      <div className="mt-6">
        <Link href={`/forms/${form.id}/responses`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> All responses
        </Link>
        <p className="mt-3 text-sm text-ink-soft">
          {formatDateTime(submission.submitted_at)}
          {submission.source ? ` · via ${submission.source}` : ""}
          {submission.duration_ms ? ` · took ${Math.round(submission.duration_ms / 1000)}s` : ""}
          {versionNumber ? ` · form v${versionNumber}` : ""}
        </p>
      </div>

      <Card className="mt-5 !p-0">
        <dl className="divide-y divide-line">
          {blocks.length === 0 && (
            <p className="px-5 py-4 text-sm text-ink-soft">This response&apos;s form version is no longer readable; raw answers are preserved in the export.</p>
          )}
          {blocks.map((b) => {
            const ans = submission.answers[b.id];
            const files = b.type === "file_upload" && ans?.type === "file_upload" ? ans.value : null;
            const Icon = BLOCK_ICONS[b.type];
            return (
              <div key={b.id} className="grid gap-1 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-6">
                <dt className="flex items-start gap-2 text-sm text-ink-soft">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
                  {b.title}
                </dt>
                <dd className="whitespace-pre-wrap text-[15px] leading-relaxed">
                  {files && files.length > 0 ? (
                    <ul className="space-y-1">
                      {files.map((id) => (
                        <li key={id}>
                          <a href={`/api/files/${id}`} className="inline-flex items-center gap-1.5 font-medium text-ink underline underline-offset-2">
                            <Download className="h-3.5 w-3.5" /> Download file
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    displayAnswer(b, ans) || <span className="text-ink-faint">—</span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </Card>

      {hidden.length > 0 && (
        <Card className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Hidden fields (from the URL)</p>
          <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {hidden.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="font-mono text-xs text-ink-faint">{k}</dt>
                <dd className="truncate">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </AppShell>
  );
}
