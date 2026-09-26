import type { Metadata } from "next";
import { Check } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { CtaBand, Section, SectionHeading } from "@/components/marketing/primitives";
import { BrandShowcase } from "@/components/marketing/BrandShowcase";
import { getProductName } from "@/lib/config";

export const metadata: Metadata = {
  title: "Features",
  description:
    "One-question-at-a-time forms with brand-aware AI drafting, every question type, branching logic, QR sharing, webhooks and server-enforced limits.",
};

const GROUPS: Array<{ title: string; lede: string; points: string[] }> = [
  {
    title: "The filling experience is the product",
    lede: "One focused question per screen, on any device.",
    points: [
      "Keyboard shortcuts: Enter, number keys, Y/N",
      "Auto-advance on single choice and ratings",
      "Answers survive a refresh",
      "Accessible: reduced motion, focus, screen readers",
    ],
  },
  {
    title: "Describe the form. Get it in your brand.",
    lede: "A brand kit holds your colours, fonts, logo and tone.",
    points: [
      "Import from a PDF, website, logo or notes",
      "Colours contrast-checked automatically",
      "Questions written in your tone of voice",
      "Nothing publishes without your review",
    ],
  },
  {
    title: "A builder that previews the truth",
    lede: "Outline, live preview and settings side by side.",
    points: [
      "Choices, ratings, grids, dates, files, consent and more",
      "Branching logic that can't break a publish",
      "Images, “Other” answers, shuffled options",
      "Autosave and versioned publishes",
    ],
  },
  {
    title: "Share it anywhere",
    lede: "Link, embed and QR code on every plan.",
    points: [
      "PNG and SVG QR downloads",
      "Embed with a single snippet",
      "Redirect after submit",
      "Response limits and closing dates",
    ],
  },
  {
    title: "Data you can act on",
    lede: "Every response, every chart, every export.",
    points: [
      "Completion rate and average time",
      "Per-question charts",
      "CSV export and signed webhooks",
      "Email alerts on every response",
    ],
  },
  {
    title: "Your data stays yours",
    lede: "Limits and privacy enforced on the server.",
    points: [
      "Workspace-scoped access control",
      "Private file storage with expiring links",
      "Rate-limited public submissions",
      "Downgrading never deletes anything",
    ],
  },
];

export default function FeaturesPage() {
  const name = getProductName();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-page px-5 pb-8 pt-16 sm:px-6 lg:pt-24">
          <h1 className="max-w-3xl font-display text-[2.75rem] leading-[1.02] tracking-tightest sm:text-[3.6rem]">
            Everything a form needs. Nothing it doesn&apos;t.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
            {name} is built around one idea: the filling experience is the product.
          </p>
        </section>

        <Section tone="paper">
          <SectionHeading title="The same form, three brands" />
          <div className="mt-10">
            <BrandShowcase />
          </div>
        </Section>

        {GROUPS.map((g, i) => (
          <Section key={g.title} tone={i % 2 === 1 ? "paper" : "plain"}>
            <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-14">
              <SectionHeading title={g.title} lede={g.lede} />
              <ul className="divide-y divide-line self-start rounded-3xl border border-line bg-paper px-6">
                {g.points.map((p) => (
                  <li key={p} className="flex items-start gap-3 py-4 text-[15px] leading-relaxed">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-positive" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        ))}

        <div className="h-16" />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}
