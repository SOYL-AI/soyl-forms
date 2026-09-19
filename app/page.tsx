import Link from "next/link";
import Image from "next/image";
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
    <div className="min-h-screen bg-background text-foreground selection:bg-brand-500/30 selection:text-brand-100 overflow-hidden">
      <SiteHeader />
      
      <main className="relative">
        {/* Abstract Background Element */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-10 dark:opacity-40 mix-blend-multiply dark:mix-blend-screen">
          <Image
            src="/hero_abstract_bg.jpg"
            alt="Abstract 3D Background"
            fill
            className="object-cover object-top opacity-50 blur-[2px]"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background"></div>
        </div>

        {/* Hero Section */}
        <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.1fr_1fr] lg:pt-28 min-h-[85vh]">
          <div className="animate-float">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-900/10 dark:border-brand-500/30 bg-brand-500/10 px-3 py-1 mb-6 backdrop-blur-md">
              <span className="flex h-2 w-2 rounded-full bg-brand-900 dark:bg-brand-500 animate-pulse"></span>
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-900 dark:text-brand-200">
                Premium Form Experience
              </span>
            </div>
            <h1 className="font-display text-5xl leading-[1.1] tracking-tight sm:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-ink via-ink-soft to-brand-600 dark:from-white dark:via-slate-200 dark:to-brand-400">
              Forms people actually finish.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-soft sm:text-xl font-light">
              {name} asks one question at a time — on a link, in an embed,
              or from a QR code — capturing more responses with stunning, responsive design.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/signup"
                className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-ink dark:bg-brand-600 px-8 py-4 text-base font-semibold text-white transition-all hover:scale-105 active:scale-[0.99] shadow-lift"
              >
                <span className="relative z-10 flex items-center gap-2">
                  Start for free
                  <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </span>
              </Link>
              <Link
                href="/f/demo"
                className="rounded-full border border-ink/10 dark:border-white/10 bg-paper/50 dark:bg-white/5 backdrop-blur-md px-8 py-4 text-base font-semibold text-ink dark:text-white transition-all hover:bg-ink/5 dark:hover:bg-white/10"
              >
                View demo
              </Link>
            </div>
            <p className="mt-6 text-sm text-ink-faint flex items-center gap-4">
              <span className="flex items-center gap-1.5"><svg className="h-4 w-4 text-ink-soft dark:text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> No credit card</span>
              <span className="flex items-center gap-1.5"><svg className="h-4 w-4 text-ink-soft dark:text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> 2 free forms</span>
            </p>
          </div>
          <div className="relative rounded-3xl border border-ink/10 dark:border-white/10 bg-ink/5 dark:bg-black/40 p-1 shadow-glass backdrop-blur-xl lg:translate-x-4">
            <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-b from-brand-900/10 dark:from-brand-500/50 to-transparent opacity-20 -z-10"></div>
            <div className="rounded-[1.4rem] bg-paper p-6 sm:p-9 h-full">
              <div className="mb-8 flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                  <div className="h-3 w-3 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                  <div className="h-3 w-3 rounded-full bg-green-500/20 border border-green-500/50"></div>
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">Live Preview</p>
              </div>
              <FormRenderer schema={heroMiniForm} />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="relative z-10 border-y border-ink/5 dark:border-white/5 bg-ink/5 dark:bg-black/20 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <div className="text-center mb-16">
              <h2 className="font-display text-3xl tracking-tight sm:text-4xl text-ink dark:text-white">
                From blank page to responses in minutes
              </h2>
              <p className="mt-4 text-ink-soft max-w-2xl mx-auto">Everything you need to create, share, and analyze premium forms without writing a line of code.</p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {[
                ["Build dynamically", "Add questions, reorder them, and preview exactly what respondents will see. Drafts autosave instantly as you type.", "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"],
                ["Publish & share", "Get a short link, a downloadable QR code, and an embed snippet. Every publish is versioned, so edits never break live forms.", "M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"],
                ["Review & analyze", "Watch responses arrive in real-time, inspect individual answers, and export to CSV when you need a spreadsheet.", "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"],
              ].map(([title, body, iconPath], i) => (
                <div key={title} className="group relative rounded-3xl border border-ink/5 dark:border-white/5 bg-paper shadow-sm dark:shadow-none dark:bg-paper-deep/20 p-8 transition-all hover:border-brand-900/20 dark:hover:bg-white/5 dark:hover:border-brand-500/30">
                  <div className="absolute -inset-px rounded-3xl bg-gradient-to-b from-brand-900/0 to-brand-900/0 dark:from-brand-500/0 dark:to-brand-500/0 group-hover:from-brand-900/5 dark:group-hover:from-brand-500/20 opacity-20 transition-all"></div>
                  <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-ink/5 dark:bg-brand-500/10 text-ink dark:text-brand-400 group-hover:bg-ink group-hover:text-white dark:group-hover:bg-brand-500 transition-colors">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} /></svg>
                  </div>
                  <h3 className="text-xl font-bold text-ink dark:text-white">{title}</h3>
                  <p className="mt-3 leading-relaxed text-ink-soft">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="relative z-10 mx-auto max-w-6xl px-5 py-24">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl text-ink dark:text-white">
              Simple INR pricing
            </h2>
            <Link href="/pricing" className="mt-4 inline-block text-sm font-semibold text-brand-700 dark:text-brand-400 hover:text-brand-900 dark:hover:text-brand-300">
              Compare all plans & features →
            </Link>
          </div>
          <div className="grid gap-6 md:grid-cols-3 items-center">
            {PLAN_ORDER.map((code) => {
              const plan = PLANS[code];
              const featured = code === "starter";
              return (
                <div
                  key={code}
                  className={`relative rounded-3xl p-8 transition-all ${
                    featured
                      ? "border border-ink/10 dark:border-brand-500/50 bg-paper shadow-lift dark:bg-gradient-to-b dark:from-brand-900/40 dark:to-black dark:shadow-[0_0_50px_-12px_rgba(124,58,237,0.3)] md:scale-105 z-10"
                      : "border border-ink/10 dark:border-white/10 bg-paper/50 dark:bg-paper-deep/30"
                  }`}
                >
                  {featured && (
                    <div className="absolute -top-4 left-0 right-0 flex justify-center">
                      <span className="rounded-full bg-ink dark:bg-brand-500 px-4 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-lg">
                        Most popular
                      </span>
                    </div>
                  )}
                  <h3 className="text-lg font-bold text-ink dark:text-white">{plan.name}</h3>
                  <p className="mt-2 text-sm text-ink-soft h-10">
                    {plan.tagline}
                  </p>
                  <div className="mt-6 mb-8 border-b border-ink/10 dark:border-white/10 pb-8">
                    <span className="font-display text-5xl text-ink dark:text-white font-bold">{formatINR(plan.monthlyPaise)}</span>
                    <span className="text-sm text-ink-soft">
                      {plan.monthlyPaise === 0 ? " forever" : " /month"}
                    </span>
                  </div>
                  <ul className="space-y-4 text-sm text-ink-soft">
                    <li className="flex items-center gap-3"><svg className={`h-5 w-5 ${featured ? "text-ink dark:text-brand-400" : "text-ink/30 dark:text-white/30"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>{plan.entitlements.maxActiveForms} live forms</li>
                    <li className="flex items-center gap-3"><svg className={`h-5 w-5 ${featured ? "text-ink dark:text-brand-400" : "text-ink/30 dark:text-white/30"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>{plan.entitlements.monthlySubmissions.toLocaleString("en-IN")} responses/mo</li>
                    <li className="flex items-center gap-3"><svg className={`h-5 w-5 ${featured ? "text-ink dark:text-brand-400" : "text-ink/30 dark:text-white/30"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>{plan.entitlements.removeBranding ? "No platform branding" : "Platform branding"}</li>
                  </ul>
                  <Link
                    href="/signup"
                    className={`mt-8 block w-full rounded-xl px-4 py-3 text-center text-sm font-semibold transition-colors ${
                      featured
                        ? "bg-ink text-white hover:bg-ink-soft dark:bg-brand-500 dark:hover:bg-brand-400"
                        : "bg-ink/5 text-ink hover:bg-ink/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                    }`}
                  >
                    Get started
                  </Link>
                </div>
              );
            })}
          </div>
        </section>

        {/* FAQ & CTA */}
        <section className="relative z-10 mx-auto max-w-4xl px-5 pb-32">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl text-ink dark:text-white">
              Questions, answered
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {FAQS.map((f) => (
              <div key={f.q} className="rounded-2xl border border-ink/5 dark:border-white/5 bg-paper dark:bg-paper-deep/20 p-6">
                <h3 className="text-lg font-bold text-ink dark:text-white mb-2">{f.q}</h3>
                <p className="text-sm leading-relaxed text-ink-soft">{f.a}</p>
              </div>
            ))}
          </div>

          <div className="mt-20 relative overflow-hidden rounded-3xl border border-ink/10 dark:border-brand-500/20 bg-paper dark:bg-gradient-to-br dark:from-brand-900/50 dark:to-background px-8 py-16 text-center sm:px-16 shadow-lift dark:shadow-[0_0_100px_-20px_rgba(124,58,237,0.2)]">
            <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-ink/5 dark:bg-brand-500/20 blur-[80px]"></div>
            <h2 className="relative z-10 font-display text-3xl tracking-tight sm:text-5xl text-ink dark:text-white font-bold mb-6">
              Your next form takes five minutes.
            </h2>
            <Link
              href="/signup"
              className="relative z-10 inline-flex items-center justify-center rounded-full bg-ink text-white dark:bg-white px-8 py-4 text-base font-bold dark:text-black transition-transform hover:scale-105 active:scale-[0.99]"
            >
              Create it for free
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
