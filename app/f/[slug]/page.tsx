import Link from "next/link";
import { BrandLockup, BrandMark } from "@/components/brand";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { formAcceptance, resolvePublicForm } from "@/lib/forms/public";
import { RespondentClient } from "@/components/renderer/RespondentClient";
import { getProductName } from "@/lib/config";
import { resolveTheme } from "@/lib/forms/themes";
import type { FormTheme } from "@/types/forms";

function Shell({
  embed,
  background,
  color,
  children,
}: {
  embed: boolean;
  background?: string;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={background ? { backgroundColor: background, color } : undefined}
    >
      {!embed && (
        <header className="border-b border-ink/10">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
            <BrandLockup compact markSize={24} />
          </div>
        </header>
      )}
      <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10 sm:pt-14">
        {children}
      </main>
    </div>
  );
}

function Unavailable({ embed, message }: { embed: boolean; message: string }) {
  return (
    <Shell embed={embed}>
      <div className="rounded-2xl border border-ink/10 bg-paper p-8 text-center">
        <h1 className="font-display text-2xl tracking-tight">Form unavailable</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          {message}
        </p>
      </div>
    </Shell>
  );
}

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { embed?: string };
}) {
  const embed = searchParams?.embed === "1";
  const resolved = await resolvePublicForm(params.slug);
  if ("error" in resolved) {
    return <Unavailable embed={embed} message={resolved.error} />;
  }
  const form = resolved.form;

  const acceptance = formAcceptance(form);
  if (!acceptance.open) {
    return <Unavailable embed={embed} message={acceptance.message} />;
  }
  if (form.settings.submissionLimit) {
    const admin = getServiceSupabase();
    const { count } = await admin!
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("form_id", form.id)
      .is("deleted_at", null);
    if ((count ?? 0) >= form.settings.submissionLimit) {
      return (
        <Unavailable
          embed={embed}
          message={form.settings.closedMessage ?? "This form is no longer accepting responses."}
        />
      );
    }
  }

  // Branding follows the workspace plan: free shows it, paid removes it.
  let showBranding = true;
  try {
    const admin = getServiceSupabase();
    const { data: sub } = await admin!
      .from("subscriptions")
      .select("plan_code")
      .eq("workspace_id", form.workspaceId)
      .maybeSingle();
    const code = (sub as { plan_code: string } | null)?.plan_code;
    showBranding = code !== "starter" && code !== "pro";
  } catch {
    showBranding = true;
  }

  const pageTheme = resolveTheme(form.theme);
  return (
    <Shell embed={embed} background={pageTheme.background} color={pageTheme.text}>
      <RespondentClient
        slug={form.slug}
        schema={form.schema}
        versionId={form.versionId}
        minimal={embed}
        theme={form.theme as FormTheme}
      />
      {showBranding && !embed && (
        <footer className="mt-12 border-t border-ink/10 pt-5 text-center text-xs text-ink-faint">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors hover:bg-ink/5 hover:text-ink-soft"
          >
            <BrandMark size={16} />
            Powered by {getProductName()}
          </Link>
        </footer>
      )}
    </Shell>
  );
}
