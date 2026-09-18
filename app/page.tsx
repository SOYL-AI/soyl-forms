import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import { heroMiniForm } from "@/lib/forms/demo";
import { PLANS, PLAN_ORDER, formatINR } from "@/lib/plans";
import { getProductName } from "@/lib/config";

const FAQS = [
  {
    q: "How is this different from a Google Form?",
    a: "Respondents see one focused question at a time with keyboard-first navigation, instead of a long scrolling page. Creators get versioned publishes, QR sharing, and webhooks in the same package.",
  },
  {
    q: "What does the free plan include?",
    a: "2 live forms, 250 responses a month, QR codes, CSV export, and basic conditional logic. No card required.",
  },
  {
    q: "How do respondents open my form?",
    a: "Every published form gets a short link you can share anywhere, plus a downloadable QR code for posters, packaging, and check-in desks. Embeds work with a single iframe snippet.",
  },
  {
    q: "How does billing work?",
    a: "Paid plans run on Razorpay Subscriptions with monthly or yearly billing in INR. Yearly billing saves roughly two months.",
  },
];

export default function HomePage() {
  const name = getProductName();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        {/* Hero: asymmetric — copy left, working mini-form right. */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-14 lg:grid-cols-[1fr_1.1fr] lg:pt-20">
          <div>
            <h1 className="font-display text-4xl leading-[1.08] tracking-tight sm:text-5xl">
              Forms people actually finish.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-soft">
              {name} asks one question at a time — on a link, in an embed,
              or from a QR code — then collects every response where you can
              see it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="rounded-full bg-ink px-7 py-3.5 text-base font-semibold text-white transition-transform active:scale-[0.99]"
              >
                Start free
              </Link>
              <Link
                href="/f/demo"
                className="rounded-full border border-ink/15 bg-white px-7 py-3.5 text-base font-semibold text-ink transition-colors hover:border-ink/30"
              >
                Answer the demo
              </Link>
            </div>
            <p className="mt-5 text-sm text-ink-faint">
              Free for 2 live forms · QR included · No card needed
            </p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-paper p-6 shadow-lift sm:p-9">
            <p className="mb-6 text-xs font-semibold uppercase tracking-widest text-ink-faint">
              Live — answer it right here
            </p>
            <FormRenderer schema={heroMiniForm} />
          </div>
        </section>

        {/* How it works: numbered steps with dividers, not cards. */}
        <section className="border-y border-ink/10 bg-paper-deep/40">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-display text-2xl tracking-tight sm:text-3xl">
              From blank page to responses in minutes
            </h2>
            <ol className="mt-8 divide-y divide-ink/10">
              {[
                ["Build", "Add questions, reorder them, and preview exactly what respondents will see. Drafts autosave as you type."],
                ["Publish & share", "Get a short link, a downloadable QR code, and an embed snippet. Every publish is versioned, so edits never rewrite history."],
                ["Review", "Watch responses arrive, inspect individual answers, and export to CSV when you need a spreadsheet."],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-5 py-6">
                  <span aria-hidden className="font-display text-2xl text-brand-700">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-lg font-bold">{title}</h3>
                    <p className="mt-1 max-w-2xl leading-relaxed text-ink-soft">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing teaser, rendered from the single source of truth. */}
        <section className="mx-auto max-w-6xl px-5 py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-2xl tracking-tight sm:text-3xl">
              Simple INR pricing
            </h2>
            <Link href="/pricing" className="text-sm font-semibold text-brand-700 hover:text-brand-900">
              Compare all plans →
            </Link>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {PLAN_ORDER.map((code) => {
              const plan = PLANS[code];
              const featured = code === "starter";
              return (
                <div
                  key={code}
                  className={
                    featured
                      ? "relative rounded-2xl bg-ink p-7 text-white shadow-lift"
                      : "rounded-2xl border border-ink/10 bg-white p-7"
                  }
                >
                  {featured && (
                    <span className="absolute -top-3 left-7 rounded-full bg-brand-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-base font-bold">{plan.name}</h3>
                  <p className={`mt-1 text-sm ${featured ? "text-white/70" : "text-ink-soft"}`}>
                    {plan.tagline}
                  </p>
                  <p className="mt-4">
                    <span className="font-display text-4xl">{formatINR(plan.monthlyPaise)}</span>
                    <span className={`text-sm ${featured ? "text-white/70" : "text-ink-faint"}`}>
                      {plan.monthlyPaise === 0 ? " forever" : " /month"}
                    </span>
                  </p>
                  <ul className={`mt-5 space-y-2 text-sm ${featured ? "text-white/85" : "text-ink-soft"}`}>
                    <li><span aria-hidden className={`mr-2 font-bold ${featured ? "text-brand-200" : "text-brand-700"}`}>✓</span>{plan.entitlements.maxActiveForms} live forms</li>
                    <li><span aria-hidden className={`mr-2 font-bold ${featured ? "text-brand-200" : "text-brand-700"}`}>✓</span>{plan.entitlements.monthlySubmissions.toLocaleString("en-IN")} responses/mo</li>
                    <li><span aria-hidden className={`mr-2 font-bold ${featured ? "text-brand-200" : "text-brand-700"}`}>✓</span>{plan.entitlements.removeBranding ? "No platform branding" : "Platform branding"}</li>
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-5 pb-20">
          <h2 className="font-display text-2xl tracking-tight sm:text-3xl">
            Questions, answered
          </h2>
          <div className="mt-6 divide-y divide-ink/10 border-y border-ink/10">
            {FAQS.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="cursor-pointer list-none text-base font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span aria-hidden className="text-ink-faint transition-transform group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-3 leading-relaxed text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-12 rounded-2xl bg-ink px-8 py-10 text-white sm:flex sm:items-center sm:justify-between sm:gap-8">
            <h2 className="font-display text-2xl tracking-tight sm:text-3xl">
              Your next form takes five minutes.
            </h2>
            <Link
              href="/signup"
              className="mt-6 inline-block shrink-0 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-ink transition-transform active:scale-[0.99] sm:mt-0"
            >
              Create it free
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
