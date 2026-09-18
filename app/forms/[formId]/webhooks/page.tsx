import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormForOwner, listWebhooks } from "@/lib/forms/actions";
import { WebhookManager } from "./WebhookManager";

export default async function WebhooksPage({
  params,
}: {
  params: { formId: string };
}) {
  const owned = await getFormForOwner(params.formId);
  if ("error" in owned) redirect("/login");
  const listed = await listWebhooks({ formId: params.formId });
  if ("error" in listed) redirect("/login");

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <p className="flex gap-4">
        <Link href="/dashboard" className="text-sm font-semibold text-ink-soft hover:text-ink">
          ← Dashboard
        </Link>
        <Link
          href={`/forms/${owned.form.id}/responses`}
          className="text-sm font-semibold text-ink-soft hover:text-ink"
        >
          Responses
        </Link>
      </p>
      <h1 className="mt-2 font-display text-3xl tracking-tight">Webhooks</h1>
      <p className="mt-1 text-sm text-ink-soft">
        {owned.form.title} · signed <code>form.submission.completed</code> events
        with retries.
      </p>
      <div className="mt-6">
        <WebhookManager formId={owned.form.id} initial={listed.webhooks} />
      </div>
    </main>
  );
}
