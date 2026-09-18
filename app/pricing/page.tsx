import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PLANS, PLAN_ORDER, formatINR } from "@/lib/plans";

function storageLabel(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${bytes / 1024 ** 3} GB`;
  return `${bytes / 1024 ** 2} MB`;
}

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-14">
        <h1 className="max-w-2xl font-display text-4xl leading-tight tracking-tight sm:text-5xl">
          straightforward pricing, in rupees.
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-soft">
          Start free. Upgrade when your forms outgrow the free limits.
          Yearly billing saves roughly two months on paid plans.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PLAN_ORDER.map((code) => {
            const plan = PLANS[code];
            const e = plan.entitlements;
            const featured = code === "starter";
            return (
              <section
                key={code}
                aria-label={`${plan.name} plan`}
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
                <h2 className="text-base font-bold">{plan.name}</h2>
                <p className={`mt-1 text-sm ${featured ? "text-white/70" : "text-ink-soft"}`}>
                  {plan.tagline}
                </p>
                <p className="mt-4">
                  <span className="font-display text-4xl">{formatINR(plan.monthlyPaise)}</span>
                  <span className={`text-sm ${featured ? "text-white/70" : "text-ink-faint"}`}>
                    {plan.monthlyPaise === 0 ? " forever" : " /month"}
                  </span>
                </p>
                {plan.yearlyPaise > 0 && (
                  <p className={`mt-1 text-sm ${featured ? "text-white/70" : "text-ink-faint"}`}>
                    or {formatINR(plan.yearlyPaise)} /year
                  </p>
                )}
                <ul className={`mt-6 space-y-2.5 text-sm ${featured ? "text-white/85" : "text-ink-soft"}`}>
                  {[
                    `${e.maxActiveForms} live forms`,
                    `${e.monthlySubmissions.toLocaleString("en-IN")} responses / month`,
                    `${storageLabel(e.storageBytes)} file storage`,
                    e.removeBranding ? "No platform branding" : "Platform branding",
                    e.customThemes ? "Custom themes & logo" : "Standard themes",
                    e.advancedLogic ? "Advanced logic" : "Basic logic",
                    `${e.maxWebhooksPerForm} webhook${e.maxWebhooksPerForm === 1 ? "" : "s"} per form`,
                    e.analyticsTier === "advanced" ? "Advanced analytics" : "Basic analytics",
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <span aria-hidden className={`font-bold ${featured ? "text-brand-200" : "text-brand-700"}`}>✓</span>
                      {line}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={
                    featured
                      ? "mt-7 block rounded-full bg-white px-6 py-3 text-center text-sm font-semibold text-ink"
                      : "mt-7 block rounded-full border border-ink/15 px-6 py-3 text-center text-sm font-semibold transition-colors hover:border-ink/30"
                  }
                >
                  {plan.monthlyPaise === 0 ? "Start free" : `Choose ${plan.name}`}
                </Link>
              </section>
            );
          })}
        </div>
        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-ink-faint">
          Limits are enforced server-side. When you approach a limit we warn
          you first; at 100% new submissions pause with a polite closed
          message instead of silently overcharging. Downgrades never delete
          your forms or responses.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
