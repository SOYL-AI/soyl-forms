import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isApplicationConfigured } from "@/lib/backend";
import { getAppContext } from "@/lib/app-context";
import { getFormForOwner } from "@/lib/forms/actions";
import { formSchemaV1 } from "@/lib/forms/schema";
import { ResponseEditor, TagEditor } from "./Editors";
import { scoreAnswers } from "@/lib/forms/quiz";
import { isAnswerable } from "@/lib/forms/logic";
import type { AnswerValue, Block } from "@/types/forms";
import { AppShell } from "@/components/app/AppShell";
import { ConfigRequired } from "@/components/app/ConfigRequired";
import { FormSubnav } from "@/components/app/FormSubnav";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { isAzureBackend } from "@/lib/backend";
import { readResponse } from "@/lib/db/repositories/responses";
import { readOwnedVersion } from "@/lib/db/repositories/forms";
import { readWorkspaceRole } from "@/lib/db/repositories/workspaces";

export const metadata: Metadata = { title: "Response", robots: { index: false } };

export default async function ResponseDetailPage(props: { params: Promise<{ formId: string; submissionId: string }> }) {
  const params = await props.params;
  if (!isAzureBackend() && !isApplicationConfigured()) return <ConfigRequired area="responses" />;
  const res = await getAppContext();
  if (!res.ok) redirect("/login");
  const owned = await getFormForOwner(params.formId);
  if ("error" in owned) redirect("/dashboard");
  const form = owned.form;
  const admin = getServiceSupabase()!;

  const { data: sub } = isAzureBackend() ? { data: await readResponse(res.ctx.userId,form.id,params.submissionId) } : await admin
    .from("submissions")
    .select("id, submitted_at, source, duration_ms, form_version_id, answers, hidden_fields, tags, edited_at")
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
    tags: string[] | null;
    edited_at: string | null;
  } | null;
  if (!submission) notFound();
  const { data: membership } = isAzureBackend() ? { data: { role: await readWorkspaceRole(res.ctx.userId,form.workspace_id) } } : await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", form.workspace_id)
    .eq("user_id", res.ctx.userId)
    .maybeSingle();
  const canEdit = ["owner", "admin", "editor"].includes((membership as { role: string } | null)?.role ?? "");
  const tags = Array.isArray(submission.tags) ? submission.tags.filter((t): t is string => typeof t === "string") : [];

  // The exact version this respondent answered (history never rewrites).
  const { data: version } = isAzureBackend() ? { data: await readOwnedVersion(res.ctx.userId,form.id,submission.form_version_id) } : await admin.from("form_versions").select("schema, settings, version_number").eq("id", submission.form_version_id).maybeSingle();
  const parsed = formSchemaV1.safeParse((version as { schema: unknown } | null)?.schema);
  const blocks: Block[] = parsed.success ? parsed.data.blocks.filter((b) => isAnswerable(b.type)) : [];
  const quizOn = Boolean((version as { settings: { quizMode?: boolean } | null } | null)?.settings?.quizMode);
  const graded = quizOn ? scoreAnswers({ blocks }, submission.answers) : null;
  const gradeOf = new Map((graded?.perQuestion ?? []).map((q) => [q.id, q]));
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
          {submission.edited_at ? " · edited by owner" : ""}
        </p>
        {graded && graded.max > 0 && (
          <p className="mt-3 font-display text-3xl tracking-tight">
            {graded.points} / {graded.max}
            <span className="ml-2 align-middle font-sans text-xs text-ink-faint">score</span>
          </p>
        )}
      </div>

      <Card className="mt-5 !p-0">
        <dl>
          <ResponseEditor
            blocks={blocks}
            answers={submission.answers}
            formId={form.id}
            submissionId={submission.id}
            canEdit={canEdit}
            grades={Object.fromEntries(gradeOf)}
          />
        </dl>
      </Card>
      <Card className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Tags</p>
        <div className="mt-2">
          <TagEditor formId={form.id} submissionId={submission.id} initialTags={tags} canEdit={canEdit} />
        </div>
      </Card>
      {hidden.length > 0 && (
        <Card className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Hidden fields (from the URL)</p>
          <dl className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
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
