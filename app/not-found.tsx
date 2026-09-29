import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 pb-28 pt-20 text-center sm:px-6 lg:pt-28">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">404</p>
        <h1 className="mt-3 font-display text-[2.75rem] leading-[1.02] tracking-tightest sm:text-[3.6rem]">Page not found</h1>
        <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-ink-soft">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/" variant="accent" size="lg">
            Go home
          </ButtonLink>
          <ButtonLink href="/dashboard" variant="secondary" size="lg">
            Your forms
          </ButtonLink>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
