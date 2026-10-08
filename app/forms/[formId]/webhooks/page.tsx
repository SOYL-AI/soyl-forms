import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/app-context";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getFormForOwner, listWebhooks } from "@/lib/forms/actions";
import { PLANS } from "@/lib/plans";
import { AppShell } from "@/components/app/AppShell";
import { ConfigRequired } from "@/components/app/ConfigRequired";
import { FormSubnav } from "@/components/app/FormSubnav";
import { hasWorkspaceRole } from "@/lib/security/workspace";
import { WebhookManager } from "./WebhookManager";
import { GoogleSheetsConnect, isGoogleSheetsUrl } from "./GoogleSheetsConnect";

export const metadata: Metadata = { title: "Integrations", robots: { index: false } };

export default async function WebhooksPage(props: { params: Promise<{ formId: string }> }) {
  const params = await props.params;
  if (!isSupabaseConfigured()) return <ConfigRequired area="webhooks" />;
  const res = await getAppContext();
  if (!res.ok) redirect(`/login?next=/forms/${params.formId}/webhooks`);
  const owned = await getFormForOwner(params.formId);
  if ("error" in owned) redirect("/dashboard");
  const canEdit = await hasWorkspaceRole(owned.form.workspace_id, "editor");
  const listed = await listWebhooks({ formId: params.formId });
  if ("error" in listed) redirect("/dashboard");

  return (
    <AppShell ctx={res.ctx} active="forms">
      <FormSubnav formId={owned.form.id} title={owned.form.title} status={owned.form.status} slug={owned.form.slug} active="webhooks" />
      <div className="mt-6 flex max-w-3xl flex-col gap-10">
        {canEdit && <GoogleSheetsConnect formId={owned.form.id} connected={listed.webhooks.some((w) => isGoogleSheetsUrl(w.url))} />}
        <section>
          <h2 className="font-display text-xl tracking-tight">Connections</h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            Send each new response to your own app with a webhook. Your {PLANS[res.ctx.plan].name} plan includes{" "}
            {PLANS[res.ctx.plan].entitlements.maxWebhooksPerForm} per form.
          </p>
          <div className="mt-5">
            <WebhookManager formId={owned.form.id} initial={listed.webhooks} readOnly={!canEdit} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
