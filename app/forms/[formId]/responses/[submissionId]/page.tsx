import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getFormForOwner } from "@/lib/forms/actions";
import { formSchemaV1 } from "@/lib/forms/schema";
import type { AnswerValue, Block } from "@/types/forms";

function display(block: Block, answer: AnswerValue | undefined): string {
  if (!answer) return "—";
  switch (answer.type) {
    case "short_text":
    case "long_text":
    case "email":
    case "phone":
    case "url":
    case "date":
      return answer.value;
    case "number":
    case "rating":
    case "opinion_scale":
      return String(answer.value);
    case "single_choice":
    case "dropdown":
      if (
        block.type === "single_choice" ||
        block.type === "multiple_choice" ||
        block.type === "dropdown"
      ) {
        return block.options.find((o) => o.id === answer.value)?.label ?? answer.value;
      }
      return answer.value;
    case "yes_no":
      return answer.value === "yes" ? "Yes" : "No";
    case "multiple_choice":
      if (block.type === "multiple_choice" || block.type === "single_choice" || block.type === "dropdown") {
        const labels = answer.value.map(
          (id) => block.options.find((o) => o.id === id)?.label ?? id,
        );
        return labels.join(", ");
      }
      return answer.value.join(", ");
    case "file_upload":
      return answer.value.join(", ");
    default:
      return "—";
  }
}

export default async function ResponseDetailPage({
  params,
}: {
  params: { formId: string; submissionId: string };
}) {
  const owned = await getFormForOwner(params.formId);
  if ("error" in owned) redirect("/login");
  const form = owned.form;

  const supabase = getServerSupabase();
  const { data: sub } = await supabase!
    .from("submissions")
    .select("id, submitted_at, source, duration_ms, form_version_id, answers")
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
  } | null;
  if (!submission) notFound();

  // The exact version this respondent answered (history never rewrites).
  const { data: version } = await supabase!
    .from("form_versions")
    .select("schema")
    .eq("id", submission.form_version_id)
    .maybeSingle();
  const parsed = formSchemaV1.safeParse(
    (version as { schema: unknown } | null)?.schema,
  );
  const blocks: Block[] = parsed.success
    ? parsed.data.blocks.filter(
        (b) => b.type !== "welcome" && b.type !== "statement" && b.type !== "thank_you",
      )
    : [];

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p>
        <Link
          href={`/forms/${form.id}/responses`}
          className="text-sm font-semibold text-ink-soft hover:text-ink"
        >
          ← All responses
        </Link>
      </p>
      <h1 className="mt-2 font-display text-3xl tracking-tight">{form.title}</h1>
      <p className="mt-1 text-sm text-ink-soft">
        {new Date(submission.submitted_at).toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
        {submission.source ? ` · via ${submission.source}` : ""}
        {submission.duration_ms ? ` · took ${Math.round(submission.duration_ms / 1000)}s` : ""}
      </p>

      <dl className="mt-8 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white">
        {blocks.length === 0 && (
          <p className="px-5 py-4 text-sm text-ink-soft">
            This response&apos;s form version is no longer readable; raw answers
            are preserved in the export.
          </p>
        )}
        {blocks.map((b) => {
          const ans = submission.answers[b.id];
          const files =
            b.type === "file_upload" && ans?.type === "file_upload" ? ans.value : null;
          return (
            <div key={b.id} className="px-5 py-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {b.title}
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">
                {files && files.length > 0 ? (
                  <ul className="space-y-1">
                    {files.map((id) => (
                      <li key={id}>
                        <a
                          href={`/api/files/${id}`}
                          className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900"
                        >
                          Download file
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  display(b, ans)
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </main>
  );
}
