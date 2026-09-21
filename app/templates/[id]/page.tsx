import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock3 } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { UseTemplateButton } from "@/components/marketing/UseTemplateButton";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import { AppShell } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { getAppContext } from "@/lib/app-context";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createFormFromTemplate } from "@/lib/forms/actions";
import { getTemplate, TEMPLATES } from "@/lib/forms/templates";
import { resolveTheme } from "@/lib/forms/themes";
import { isAnswerable } from "@/lib/forms/logic";
import { BLOCK_TYPE_LABELS } from "@/lib/forms/builder";
import { BLOCK_ICONS } from "@/lib/forms/blockIcons";

export function generateStaticParams() {
  return TEMPLATES.map((t) => ({ id: t.id }));
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const t = getTemplate(params.id);
  if (!t) return { title: "Template" };
  return { title: `${t.name} template`, description: t.description };
}

export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { use?: string };
}) {
  const template = getTemplate(params.id);
  if (!template) notFound();

  const ctx = isSupabaseConfigured() ? await getAppContext() : null;
  const signedIn = Boolean(ctx?.ok);

  // Arriving from signup with intent: create immediately.
  if (searchParams?.use === "1" && ctx?.ok) {
    const res = await createFormFromTemplate({ templateId: template.id });
    if (res.ok) redirect(`/builder/${res.id}`);
  }

  const t = resolveTheme(template.theme);
  const questions = template.schema.blocks.filter((b) => isAnswerable(b.type));

  const body = (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
      <div>
        <Link href="/templates" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> All templates
        </Link>
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{template.category}</p>
        <h1 className="mt-2 font-display text-[2.4rem] leading-[1.05] tracking-tight sm:text-[3rem]">{template.name}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-soft">{template.description}</p>
        <p className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink-faint">
          <span>{questions.length} questions</span>
          {template.schema.logic.length > 0 && <Badge tone="info">Branching logic</Badge>}
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3.5 w-3.5" /> about {template.minutes} min to answer
          </span>
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <UseTemplateButton templateId={template.id} signedIn={signedIn} size="lg" label={signedIn ? "Use this template" : "Use this template — free"} />
          {!signedIn && <span className="text-sm text-ink-faint">Creates your account first.</span>}
        </div>
        <div className="mt-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Questions</p>
          <ol className="mt-3 divide-y divide-line rounded-2xl border border-line bg-paper">
            {questions.map((b, i) => {
              const Icon = BLOCK_ICONS[b.type];
              return (
                <li key={b.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="w-5 text-right text-xs tabular-nums text-ink-faint">{i + 1}</span>
                  <Icon className="h-4 w-4 shrink-0 text-ink-faint" />
                  <span className="min-w-0 flex-1 truncate">{b.title}</span>
                  <span className="shrink-0 text-xs text-ink-faint">{BLOCK_TYPE_LABELS[b.type]}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <div className="lg:sticky lg:top-24">
        <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Try it as a respondent</p>
        <div className="overflow-hidden rounded-[1.75rem] border border-line shadow-lift" style={{ background: t.background }}>
          <div className="min-h-[520px] px-7 py-10 sm:px-10">
            <FormRenderer schema={template.schema} theme={template.theme} settings={template.settings} preview />
          </div>
        </div>
      </div>
    </div>
  );

  if (ctx?.ok) {
    return (
      <AppShell ctx={ctx.ctx} active="templates" wide>
        {body}
      </AppShell>
    );
  }
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-page px-5 pb-24 pt-12 sm:px-6 lg:pt-16">{body}</main>
      <SiteFooter />
    </div>
  );
}
