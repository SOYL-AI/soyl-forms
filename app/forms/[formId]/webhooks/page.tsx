import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/app-context";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getFormForOwner, listWebhooks } from "@/lib/forms/actions";
import { PLANS } from "@/lib/plans";
import { AppShell } from "@/components/app/AppShell";
import { ConfigRequired } from "@/components/app/ConfigRequired";
import { FormSubnav } from "@/components/app/FormSubnav";
import { WebhookManager } from "./WebhookManager";

export const metadata: Metadata = { title: "Webhooks", robots: { index: false } };

export default async function WebhooksPage({ params }: { params: { formId: string } }) {
  if (!isSupabaseConfigured()) return <ConfigRequired area="webhooks" />;
  const res = await getAppContext();
  if (!res.ok) redirect(`/login?next=/forms/${params.formId}/webhooks`);
  const owned = await getFormForOwner(params.formId);
  if ("error" in owned) redirect("/dashboard");
  const listed = await listWebhooks({ formId: params.formId });
  if ("error" in listed) redirect("/dashboard");

  return (
    <AppShell ctx={res.ctx} active="forms">
      <FormSubnav formId={owned.form.id} title={owned.form.title} status={owned.form.status} slug={owned.form.slug} active="webhooks" />
      <div className="mt-6 max-w-3xl">
        <p className="text-sm leading-relaxed text-ink-soft">
          Each completed response POSTs a signed <code className="font-mono text-xs">form.submission.completed</code> event to every active endpoint,
          with bounded retries. Your {PLANS[res.ctx.plan].name} plan allows {PLANS[res.ctx.plan].entitlements.maxWebhooksPerForm} per form.
        </p>
        <div className="mt-6">
          <WebhookManager formId={owned.form.id} initial={listed.webhooks} />
        </div>
      </div>
    </AppShell>
  );
}
