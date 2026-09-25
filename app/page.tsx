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
import { RadialLines, Section, SectionHeading } from "@/components/marketing/primitives";
import { BrandShowcase } from "@/components/marketing/BrandShowcase";
import { PricingTable } from "@/components/marketing/PricingTable";
import { Faq, HOME_FAQS } from "@/components/marketing/Faq";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import { heroMiniForm } from "@/lib/forms/demo";
import { TEMPLATES } from "@/lib/forms/templates";
import { ButtonLink } from "@/components/ui/button";
import { getProductName } from "@/lib/config";

const STEPS = [
  {
    n: "1",
    title: "Describe it — or build it",
    body: "Type a sentence and the AI drafts every question in your brand, or start from a template and edit in a builder that previews exactly what respondents see.",
  },
  {
    n: "2",
    title: "Publish and share",
    body: "Every publish is versioned. Share a short link, drop in an embed, or print the QR code — on every plan, including free.",
  },
  {
    n: "3",
    title: "Collect and understand",
    body: "Responses arrive with per-question breakdowns, a 14-day chart and CSV export. Send them onward with signed webhooks or email alerts.",
  },
];

const FEATURES = [
  { icon: MessageSquare, title: "One question at a time", body: "Keyboard-first, auto-advancing, with honest progress. Answers survive a refresh." },
  { icon: ListChecks, title: "20 question types", body: "Text, choices, ratings, opinion scales, grids, dates, times, files and consent." },
  { icon: GitBranch, title: "Branching logic", body: "If-this-then-jump rules per answer, validated so a publish can never break." },
  { icon: QrCode, title: "QR, link and embed", body: "PNG and SVG QR downloads, an iframe snippet, and print-source tracking." },
  { icon: Webhook, title: "Webhooks and CSV", body: "HMAC-signed events with retries; exports that match what you see on screen." },
  { icon: BarChart3, title: "Responses that read well", body: "Views, completion rate, average time, choice and grid distributions." },
  { icon: Send, title: "Redirects and alerts", body: "Send respondents to a thank-you page; get each response in your inbox." },
  { icon: LayoutGrid, title: "Templates", body: `${TEMPLATES.length} starters for events, hiring, feedback and sales — brand-themed in one click.` },
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
  const name = getProductName();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-page items-center gap-12 px-5 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-24">
            <div>
              <p className="rise text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                Conversational forms · by SOYL AI
              </p>
              <h1 className="rise rise-1 mt-4 font-display text-[2.75rem] leading-[1.02] tracking-tightest sm:text-[3.6rem] lg:text-[4.2rem]">
                Forms people actually finish.
              </h1>
              <p className="rise rise-2 mt-6 max-w-lg text-lg leading-relaxed text-ink-soft sm:text-xl">
                One question at a time, on any screen. Describe what you need and {name} drafts the whole form in your brand — colours, fonts, tone — ready to share by link or QR. Priced in rupees.
              </p>
              <div className="rise rise-3 mt-8 flex flex-wrap items-center gap-3">
                <ButtonLink href="/signup" variant="accent" size="lg">
                  Start free <ArrowRight className="h-4 w-4" />
                </ButtonLink>
                <ButtonLink href="/f/demo" variant="secondary" size="lg">
                  Try the live demo
                </ButtonLink>
              </div>
              <p className="rise rise-4 mt-5 text-sm text-ink-faint">Free plan · No card · 2 live forms · Upgrade from ₹199/mo</p>
            </div>

            <div className="rise rise-2 relative">
              <div className="pointer-events-none absolute -inset-16 text-ink/[0.06] dark:text-paper/[0.05]">
                <RadialLines className="inset-0 h-full w-full" />
              </div>
              <div className="relative overflow-hidden rounded-[1.75rem] border border-line bg-paper shadow-pop">
                <div className="flex items-center justify-between border-b border-line px-5 py-3">
                  <span className="flex items-center gap-1.5" aria-hidden>
                    <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
                    <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
                    <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                    Live · use your keyboard
                  </span>
                </div>
                <div className="px-6 py-8 sm:px-9 sm:py-10">
                  <FormRenderer schema={heroMiniForm} theme={{ background: "#ffffff", text: "#101012", accent: "#f2b418", headingFont: "system-sans", bodyFont: "system-sans", radius: "lg", buttonStyle: "pill" }} preview />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Brand-aware AI */}
        <Section tone="paper" id="brand">
          <SectionHeading
            eyebrow="Brand-aware AI"
            title="Your brand in. A finished form out."
            lede="Upload a logo and guidelines — or paste your website. We extract your palette, type and tone of voice once, then every draft arrives dressed for your brand. Switch a sample brand and watch the same form change."
          />
          <div className="mt-12">
            <BrandShowcase />
          </div>
        </Section>

        {/* How it works */}
        <Section>
          <SectionHeading eyebrow="How it works" title="From a sentence to responses in minutes" />
          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="relative rounded-3xl border border-line bg-paper p-7">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-display text-sm font-semibold text-paper">
                  {s.n}
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2.5 leading-relaxed text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* Feature grid */}
        <Section tone="paper" id="features">
          <SectionHeading eyebrow="Everything a form needs" title="Built for the people answering, and the people asking." />
          <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="bg-paper p-6">
                  <Icon className="h-5 w-5 text-ink" />
                  <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{f.body}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-sm text-ink-soft">
            <Link href="/features" className="font-semibold text-ink underline underline-offset-2">
              See the full feature tour →
            </Link>
          </p>
        </Section>

        {/* Use cases */}
        <Section>
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
            <SectionHeading
              eyebrow="Templates"
              title="Start from something that already works"
              lede={`${TEMPLATES.length} templates with real questions, logic and themes. Pick one, apply your brand kit, publish.`}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {USE_CASES.map((u) => (
                <Link
                  key={u.label}
                  href={`/templates?category=${encodeURIComponent(u.category)}`}
                  className="group flex items-center justify-between rounded-2xl border border-line bg-paper px-5 py-4 transition-colors hover:border-ink/40"
                >
                  <span>
                    <span className="block font-semibold">{u.label}</span>
                    <span className="block text-xs text-ink-faint">{u.category}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                </Link>
              ))}
            </div>
          </div>
        </Section>

        {/* Pricing */}
        <Section tone="paper" id="pricing">
          <SectionHeading
            eyebrow="Pricing"
            title="Simple pricing, in rupees."
            lede="Start free. Upgrade when your forms outgrow the limits. Every plan includes QR codes, logic and AI credits."
            align="center"
          />
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

        {/* Final CTA */}
        <Section tone="ink" className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-40 -top-40 h-[640px] w-[640px] text-paper/[0.07]">
            <RadialLines className="inset-0 h-full w-full" />
          </div>
          <div className="relative text-center">
            <h2 className="font-display text-[2.25rem] leading-[1.05] tracking-tight sm:text-[3.2rem]">
              Your next form takes five minutes.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-paper/70">
              Describe it, brand it, share it. Free to start, no card required.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/signup" variant="accent" size="lg">
                Create it free <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/templates" variant="ghost" size="lg" className="text-paper hover:bg-paper/10 hover:text-paper">
                Browse templates
              </ButtonLink>
            </div>
          </div>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
