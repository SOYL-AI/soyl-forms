import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { TemplateGallery } from "@/components/marketing/TemplateGallery";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader } from "@/components/ui/card";
import { getAppContext } from "@/lib/app-context";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { TEMPLATES } from "@/lib/forms/templates";

export const metadata: Metadata = {
  title: "Templates",
  description: `${TEMPLATES.length} ready-made conversational form templates for events, feedback, hiring, sales, education and research. Apply your brand kit and publish in a click.`,
};

export default async function TemplatesPage({ searchParams }: { searchParams?: { category?: string } }) {
  const ctx = isSupabaseConfigured() ? await getAppContext() : null;
  const signedIn = Boolean(ctx?.ok);

  if (ctx?.ok) {
    return (
      <AppShell ctx={ctx.ctx} active="templates" wide>
        <PageHeader
          title="Templates"
        />
        <div className="mt-8">
          <TemplateGallery category={searchParams?.category} signedIn />
        </div>
      </AppShell>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-page px-5 pb-24 pt-16 sm:px-6 lg:pt-24">
        <h1 className="max-w-2xl font-display text-[2.75rem] leading-[1.02] tracking-tightest sm:text-[3.6rem]">
          Start from a template
        </h1>
        <div className="mt-12">
          <TemplateGallery category={searchParams?.category} signedIn={signedIn} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
