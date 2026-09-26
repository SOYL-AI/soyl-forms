import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  GitBranch,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  QrCode,
  Send,
  Webhook,
} from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { CtaBand, RadialLines, Section, SectionHeading } from "@/components/marketing/primitives";
import { BrandShowcase } from "@/components/marketing/BrandShowcase";
import { PricingTable } from "@/components/marketing/PricingTable";
import { Faq, HOME_FAQS } from "@/components/marketing/Faq";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import { heroMiniForm } from "@/lib/forms/demo";
import { TEMPLATES } from "@/lib/forms/templates";
import { ButtonLink } from "@/components/ui/button";

const STEPS = [
  { n: "1", title: "Describe it", body: "Type a sentence, or start from a template." },
  { n: "2", title: "Share it", body: "Link, embed or QR code — on every plan." },
  { n: "3", title: "Read the results", body: "Live charts, CSV export, webhooks and email alerts." },
];

const FEATURES = [
  { icon: MessageSquare, title: "One question at a time", body: "Keyboard-first, with honest progress." },
  { icon: ListChecks, title: "Every question type", body: "Choices, ratings, grids, dates, files and consent." },
  { icon: GitBranch, title: "Branching logic", body: "Skip what doesn't apply." },
  { icon: QrCode, title: "Link, embed and QR", body: "Share anywhere, track print scans." },
  { icon: Webhook, title: "Webhooks and CSV", body: "Signed events, clean exports." },
  { icon: BarChart3, title: "Built-in analytics", body: "Completion rates and answer charts." },
  { icon: Send, title: "Redirects and alerts", body: "Email on every response." },
  { icon: LayoutGrid, title: "Templates", body: "Ready-made forms, one click away." },
];

const USE_CASES = [
  { label: "Event registration", category: "Events" },
  { label: "Customer feedback & NPS", category: "Feedback" },
  { label: "Job applications", category: "Hiring" },
  { label: "Lead capture", category: "Sales" },
  { label: "Course evaluations", category: "Education" },
  { label: "User research", category: "Research" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-page items-center gap-12 px-5 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-24">
            <div>
              <h1 className="rise font-display text-[2.75rem] leading-[1.02] tracking-tightest sm:text-[3.6rem] lg:text-[4.2rem]">
                Forms people actually finish.
              </h1>
              <p className="rise rise-1 mt-6 max-w-md text-lg leading-relaxed text-ink-soft sm:text-xl">
                One question at a time, in your brand. Describe it and AI builds it.
              </p>
              <div className="rise rise-2 mt-8 flex flex-wrap items-center gap-3">
                <ButtonLink href="/signup" variant="accent" size="lg">
                  Start free <ArrowRight className="h-4 w-4" />
                </ButtonLink>
                <ButtonLink href="/f/demo" variant="secondary" size="lg">
                  Try the demo
                </ButtonLink>
              </div>
            </div>

            <div className="rise rise-2 relative">
              <div className="pointer-events-none absolute -inset-16 text-ink/[0.06]">
                <RadialLines className="inset-0 h-full w-full" />
              </div>
              {/* A product frame: always the form's own white surface, in both site themes. */}
              <div className="relative overflow-hidden rounded-[1.75rem] bg-white shadow-pop ring-1 ring-black/10 dark:ring-white/10">
                <div className="flex items-center gap-1.5 border-b border-black/[0.07] px-5 py-3.5" aria-hidden>
                  <span className="h-2.5 w-2.5 rounded-full bg-black/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-black/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-black/10" />
                </div>
                <div className="px-6 py-8 sm:px-9 sm:py-10">
                  <FormRenderer
                    schema={heroMiniForm}
                    theme={{ background: "#ffffff", text: "#101012", accent: "#f2b418", headingFont: "system-sans", bodyFont: "system-sans", radius: "lg", buttonStyle: "pill" }}
                    preview
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Brand-aware AI */}
        <Section tone="paper" id="brand">
          <SectionHeading
            title="Your brand in. A finished form out."
            lede="Add your logo or website once. Every draft arrives in your colours, fonts and tone."
          />
          <div className="mt-12">
            <BrandShowcase />
          </div>
        </Section>

        {/* How it works */}
        <Section>
          <SectionHeading title="From a sentence to responses in minutes" />
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-3xl border border-line bg-paper p-7">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent font-display text-sm font-semibold text-accent-ink">
                  {s.n}
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* Feature grid */}
        <Section tone="paper" id="features">
          <SectionHeading title="Everything a form needs." />
          <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="bg-paper p-6">
                  <Icon className="h-5 w-5 text-ink" />
                  <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{f.body}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-6">
            <Link href="/features" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink hover:underline hover:underline-offset-4">
              All features <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </p>
        </Section>

        {/* Templates */}
        <Section>
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
            <SectionHeading title="Start from a template" lede={`${TEMPLATES.length} ready-made forms. Pick one, make it yours.`} />
            <div className="grid gap-3 sm:grid-cols-2">
              {USE_CASES.map((u) => (
                <Link
                  key={u.label}
                  href={`/templates?category=${encodeURIComponent(u.category)}`}
                  className="group flex items-center justify-between rounded-2xl border border-line bg-paper px-5 py-4 font-semibold transition-colors hover:border-ink/40"
                >
                  {u.label}
                  <ArrowRight className="h-4 w-4 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                </Link>
              ))}
            </div>
          </div>
        </Section>

        {/* Pricing */}
        <Section tone="paper" id="pricing">
          <SectionHeading title="Simple pricing, in rupees." align="center" />
          <div className="mt-12">
            <PricingTable compact />
          </div>
        </Section>

        {/* FAQ */}
        <Section>
          <div className="mx-auto max-w-3xl">
            <Faq items={HOME_FAQS} />
          </div>
        </Section>

        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}
