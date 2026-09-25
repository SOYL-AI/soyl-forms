import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Section, SectionHeading } from "@/components/marketing/primitives";
import { BrandShowcase } from "@/components/marketing/BrandShowcase";
import { ButtonLink } from "@/components/ui/button";
import { getProductName } from "@/lib/config";

export const metadata: Metadata = {
  title: "Features",
  description:
    "One-question-at-a-time forms with brand-aware AI drafting, 20 question types, branching logic, QR sharing, webhooks and server-enforced limits.",
};

const GROUPS: Array<{ eyebrow: string; title: string; lede: string; points: string[] }> = [
  {
    eyebrow: "Respondent experience",
    title: "The filling experience is the product",
    lede: "One focused question per screen, large type, and motion that stays out of the way. Works the same on a phone at a check-in desk as on a laptop.",
    points: [
      "Enter to advance, Shift+Enter for new lines, number keys and Y/N to pick",
      "Auto-advance on single-choice, yes/no and ratings (you can turn it off)",
      "Answers persist through a refresh and survive Back navigation",
      "Honest progress — a best-effort count that never lies about branching forms",
      "Respects reduced-motion, visible focus, screen-reader announcements",
      "Closed, full, and error states that explain what happened",
    ],
  },
  {
    eyebrow: "Brand kit & AI",
    title: "Describe the form. Get it in your brand.",
    lede: "A brand kit holds your palette, typography, logo and tone of voice. The AI writes questions the way you would and styles the result to match — you review, tweak, publish.",
    points: [
      "Extract a brand from a guidelines PDF, a website URL, a logo, or plain notes",
      "Colours are contrast-checked automatically so text always stays readable",
      "Fonts come from a curated set of 19 web fonts, matched to what your brand uses",
      "Questions written in your tone; branching added when it clearly helps",
      "Every draft opens in the builder — nothing publishes without you",
      "Included credits on every plan; top-up packs that never expire",
    ],
  },
  {
    eyebrow: "Builder",
    title: "A builder that previews the truth",
    lede: "Outline, live preview and settings side by side. The preview is the real renderer, following the question you're editing.",
    points: [
      "20 question types including grid, opinion scale, consent, time and file upload",
      "Per-answer branching rules, validated so a publish can never break",
      "Question images, “Other” free-text, shuffled options, min/max selections",
      "Presets, custom colours, fonts, corner radius, button shape, logo placement",
      "Autosave with conflict detection; versioned publishes that never break live links",
      "Desktop and phone-width preview, full-screen test mode",
    ],
  },
  {
    eyebrow: "Sharing",
    title: "Built for the real world",
    lede: "A short link, an iframe embed and a QR code on every published form — free plan included.",
    points: [
      "PNG and SVG QR downloads with source tagging (?src=qr)",
      "Embed mode that hides outer chrome and keeps navigation visible",
      "Redirect respondents to any https URL after they finish",
      "Custom thank-you button with a link",
      "Response limits and scheduled closing with your own message",
    ],
  },
  {
    eyebrow: "Responses & integrations",
    title: "Data you can act on",
    lede: "A readable list, a detail view for each response, distributions per question, and exports that match what's on screen.",
    points: [
      "Views, starts, completion rate and average time",
      "Choice, rating, yes/no and grid breakdowns",
      "CSV export with one column per question (grids expand per row)",
      "HMAC-signed webhooks with bounded retries and test deliveries",
      "Email notifications to up to five addresses (paid plans)",
      "Owner-authorised downloads for uploaded files — never public",
    ],
  },
  {
    eyebrow: "Trust",
    title: "Limits that hold, data that stays yours",
    lede: "Everything a plan promises is enforced on the server. Downgrading never deletes anything.",
    points: [
      "Row-level security scoped to your workspace",
      "Public submissions go through a rate-limited, idempotent server endpoint",
      "Uploads in a private bucket, served only by short-lived signed URLs",
      "Razorpay webhooks are the source of truth for paid access",
      "Versioned publishes: historical responses always map to the questions they answered",
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Product</p>
          <h1 className="mt-3 max-w-3xl font-display text-[2.75rem] leading-[1.02] tracking-tightest sm:text-[3.6rem]">
            Everything a form needs. Nothing it doesn&apos;t.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
            {name} is built around one idea: the filling experience is the product. Everything else exists to get a great, on-brand form in front of people fast.
          </p>
        </section>

        <Section tone="paper">
          <SectionHeading eyebrow="See it" title="The same form, three brands" lede="This is the mechanism behind brand-aware drafting — a kit re-themes any form instantly." />
          <div className="mt-10">
            <BrandShowcase />
          </div>
        </Section>

        {GROUPS.map((g, i) => (
          <Section key={g.title} tone={i % 2 === 1 ? "paper" : "plain"}>
            <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-14">
              <SectionHeading eyebrow={g.eyebrow} title={g.title} lede={g.lede} />
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

        <Section>
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink href="/f/demo" variant="secondary" size="lg">
              Feel it in the demo
            </ButtonLink>
            <ButtonLink href="/signup" variant="accent" size="lg">
              Start free <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
