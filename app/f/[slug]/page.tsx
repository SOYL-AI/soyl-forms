import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { formAcceptance, resolvePublicForm, resolveFormVersion } from "@/lib/forms/public";
import { loadResume } from "@/lib/forms/resume";
import { RespondentClient } from "@/components/renderer/RespondentClient";
import { publicSchema } from "@/lib/forms/quiz";
import { getProductName } from "@/lib/config";
import { resolveTheme, themeFontsHref } from "@/lib/forms/themes";
import { getWorkspacePlan } from "@/lib/billing/plan";
import { PLANS } from "@/lib/plans";
import type { FormSettings, FormTheme } from "@/types/forms";

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const resolved = await resolvePublicForm(params.slug);
  if ("error" in resolved) return { title: "Form unavailable", robots: { index: false } };
  const welcome = resolved.form.schema.blocks.find((b) => b.type === "welcome");
  const description = welcome?.description ?? `Answer ${resolved.form.title} — takes about a minute.`;
  return {
    title: resolved.form.title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title: resolved.form.title, description, type: "website" },
  };
}

function Shell({
  embed,
  theme,
  children,
  footer,
}: {
  embed: boolean;
  theme?: ReturnType<typeof resolveTheme>;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const fontHref = theme ? themeFontsHref(theme) : null;
  return (
    <div
      className={embed ? undefined : "flex min-h-[100svh] flex-col"}
      style={theme ? { backgroundColor: theme.background, color: theme.text, fontFamily: theme.body.stack } : undefined}
    >
      {fontHref ? (
        <>
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="stylesheet" href={fontHref} />
        </>
      ) : null}
      <main className={embed ? "mx-auto w-full max-w-2xl px-4 py-6" : "mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-12 sm:py-16"}>
        {children}
      </main>
      {footer}
    </div>
  );
}

function Unavailable({ embed, message, title = "Form unavailable" }: { embed: boolean; message: string; title?: string }) {
  return (
    <Shell embed={embed}>
      <div className="rounded-3xl border border-line bg-paper p-8 text-center shadow-card">
        <h1 className="font-display text-2xl tracking-tight">{title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">{message}</p>
        {!embed && (
          <p className="mt-6 text-xs text-ink-faint">
            <Link href="/" className="inline-flex items-center gap-1.5 hover:text-ink">
              <BrandMark size={14} /> Powered by {getProductName()}
            </Link>
          </p>
        )}
      </div>
    </Shell>
  );
}

export default async function PublicFormPage(
  props: {
    params: Promise<{ slug: string }>;
    searchParams?: Promise<{ embed?: string; resume?: string; v?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const embed = searchParams?.embed === "1";
  const resolved = await resolvePublicForm(params.slug);
  if ("error" in resolved) return <Unavailable embed={embed} message={resolved.error} />;
  let form = resolved.form;

  const acceptance = formAcceptance(form);
  if (!acceptance.open) return <Unavailable embed={embed} title="This form is closed" message={acceptance.message} />;

  const resumeToken = searchParams?.resume;
  const resume = resumeToken ? await loadResume(form.id, resumeToken) : null;
  if (resumeToken && !resume) return <Unavailable embed={embed} message="This resume link is invalid, expired, or already submitted." />;
  const older = resume?.version ?? (searchParams?.v ? await resolveFormVersion(form.id, searchParams.v) : null);
  if (searchParams?.v && !older) return <Unavailable embed={embed} message="This form version is no longer available." />;
  if (older) form = { ...form, schema: older.schema, versionId: older.versionId, settings: older.settings, theme: older.theme, title: older.schema.title };

  const admin = getServiceSupabase()!;
  if (resolved.form.settings.submissionLimit) {
    const { count } = await admin.from("submissions").select("id", { count: "exact", head: true }).eq("form_id", form.id).is("deleted_at", null);
    if ((count ?? 0) >= resolved.form.settings.submissionLimit) {
      return <Unavailable embed={embed} title="This form is full" message={resolved.form.settings.closedMessage ?? "This form is no longer accepting responses."} />;
    }
  }

  // Branding follows the workspace's effective plan (webhook-confirmed).
  const plan = await getWorkspacePlan(form.workspaceId);
  const showBranding = !PLANS[plan].entitlements.removeBranding;
  const theme = resolveTheme(form.theme);

  return (
    <Shell
      embed={embed}
      theme={theme}
      footer={
        showBranding && !embed ? (
          <footer className="px-5 pb-6 text-center text-xs" style={{ color: `${theme.text}99` }}>
            <Link href="/?utm_source=form-footer" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-opacity hover:opacity-100" style={{ opacity: 0.85 }}>
              <BrandMark size={16} />
              Made with {getProductName()}
            </Link>
          </footer>
        ) : null
      }
    >
      <RespondentClient
        resume={resume?.state}
        slug={form.slug}
        schema={publicSchema(form.schema)}
        versionId={form.versionId}
        minimal={embed}
        theme={form.theme as FormTheme}
        settings={form.settings as FormSettings}
      />
      {showBranding && embed && (
        <p className="mt-6 text-center text-[11px]" style={{ color: `${theme.text}80` }}>
          <a href="/?utm_source=embed" target="_blank" rel="noreferrer" className="underline underline-offset-2">
            Made with {getProductName()}
          </a>
        </p>
      )}
    </Shell>
  );
}
