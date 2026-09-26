"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import {
  AI_CREDIT_PACKS,
  PLANS,
  PLAN_ORDER,
  formatINR,
  yearlyPerMonthPaise,
  yearlySavingsPct,
  type BillingInterval,
  type PlanCode,
} from "@/lib/plans";
import { formatBytes, cn } from "@/lib/utils";
import { Segmented } from "@/components/ui/input";
import { ButtonLink } from "@/components/ui/button";

function planHref(code: PlanCode, interval: BillingInterval): string {
  return code === "free" ? "/signup" : `/signup?plan=${code}&interval=${interval}`;
}

const HIGHLIGHTS: Record<PlanCode, string[]> = {
  free: ["2 live forms", "250 responses / month", "Every question type & logic", "QR code, embed, CSV export", "8 theme presets", "10 AI credits / month"],
  starter: ["15 live forms", "5,000 responses / month", "Custom colours, fonts & logo", "Brand kits (3) for AI drafts", "Remove SOYL branding", "Email notifications", "40 AI credits / month"],
  pro: ["100 live forms", "25,000 responses / month", "Everything in Starter", "10 brand kits", "Advanced analytics", "20 webhooks per form", "150 AI credits / month"],
};

export function PricingTable({ compact }: { compact?: boolean }) {
  const [interval, setInterval] = useState<BillingInterval>("yearly");
  return (
    <div>
      <div className="flex justify-center">
        <Segmented<BillingInterval>
          label="Billing period"
          value={interval}
          onChange={setInterval}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "yearly", label: `Yearly · save ${yearlySavingsPct(PLANS.starter)}%` },
          ]}
        />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3 md:items-stretch">
        {PLAN_ORDER.map((code) => {
          const plan = PLANS[code];
          const featured = code === "starter";
          const price = plan.monthlyPaise === 0 ? 0 : interval === "monthly" ? plan.monthlyPaise : yearlyPerMonthPaise(plan);
          return (
            <section
              key={code}
              aria-label={`${plan.name} plan`}
              className={cn(
                "relative flex flex-col rounded-3xl border p-6 sm:p-7",
                featured ? "border-inverse bg-inverse text-inverse-ink shadow-pop ring-1 ring-accent/40" : "border-line bg-paper",
              )}
            >
              {featured && (
                <span className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-accent-ink">
                  Most popular
                </span>
              )}
              <p className="font-display text-lg font-semibold">{plan.name}</p>
              <p className={cn("mt-1 text-sm", featured ? "text-inverse-ink/70" : "text-ink-soft")}>{plan.audience}</p>
              <p className="mt-5 flex items-baseline gap-1">
                <span className="font-display text-[2.75rem] leading-none tracking-tight">{formatINR(price)}</span>
                <span className={cn("text-sm", featured ? "text-inverse-ink/70" : "text-ink-faint")}>
                  {plan.monthlyPaise === 0 ? "forever" : "/ month"}
                </span>
              </p>
              {plan.monthlyPaise > 0 && (
                <p className={cn("mt-1 text-xs", featured ? "text-inverse-ink/60" : "text-ink-faint")}>
                  {interval === "yearly"
                    ? `${formatINR(plan.yearlyPaise)} billed yearly`
                    : `or ${formatINR(yearlyPerMonthPaise(plan))}/mo billed yearly`}
                </p>
              )}
              <ul className={cn("mt-6 flex-1 space-y-2.5 text-sm", featured ? "text-inverse-ink/85" : "text-ink-soft")}>
                {HIGHLIGHTS[code].slice(0, compact ? 4 : undefined).map((line) => (
                  <li key={line} className="flex items-start gap-2.5">
                    <Check className={cn("mt-0.5 h-4 w-4 shrink-0", featured ? "text-accent" : "text-positive")} />
                    {line}
                  </li>
                ))}
              </ul>
              <ButtonLink
                href={planHref(code, interval)}
                variant={featured ? "accent" : "secondary"}
                size="lg"
                className="mt-7 w-full"
              >
                {plan.monthlyPaise === 0 ? "Start free" : `Start with ${plan.name}`}
              </ButtonLink>
            </section>
          );
        })}
      </div>

      {compact ? (
        <p className="mt-8 text-center text-sm">
          <Link href="/pricing" className="font-semibold text-ink hover:underline hover:underline-offset-4">
            Compare plans →
          </Link>
        </p>
      ) : (
        <ComparisonTable interval={interval} />
      )}
    </div>
  );
}

function ComparisonTable({ interval }: { interval: BillingInterval }) {
  const e = (code: PlanCode) => PLANS[code].entitlements;
  const rows: Array<{ label: string; values: Array<string | boolean> }> = [
    { label: "Live (published) forms", values: PLAN_ORDER.map((c) => String(e(c).maxActiveForms)) },
    { label: "Responses per month", values: PLAN_ORDER.map((c) => e(c).monthlySubmissions.toLocaleString("en-IN")) },
    { label: "File upload storage", values: PLAN_ORDER.map((c) => formatBytes(e(c).storageBytes)) },
    { label: "Every question type", values: [true, true, true] },
    { label: "Branching logic", values: [true, true, true] },
    { label: "QR code, embed, CSV export", values: [true, true, true] },
    { label: "Theme presets", values: [true, true, true] },
    { label: "Custom colours, fonts & logo", values: PLAN_ORDER.map((c) => e(c).customThemes) },
    { label: "Brand kits for AI drafts", values: PLAN_ORDER.map((c) => `${e(c).maxBrandKits}`) },
    { label: "AI credits included / month", values: PLAN_ORDER.map((c) => `${e(c).aiCreditsMonthly}`) },
    { label: "Remove SOYL branding", values: PLAN_ORDER.map((c) => e(c).removeBranding) },
    { label: "Email notifications", values: PLAN_ORDER.map((c) => (e(c).emailNotifications ? `${e(c).monthlyNotificationEmails.toLocaleString("en-IN")} / mo` : false)) },
    { label: "Webhooks per form", values: PLAN_ORDER.map((c) => String(e(c).maxWebhooksPerForm)) },
    { label: "Analytics", values: PLAN_ORDER.map((c) => (e(c).analyticsTier === "advanced" ? "Advanced" : "Basic")) },
    { label: "Version history", values: PLAN_ORDER.map((c) => `${e(c).versionHistoryDays} days`) },
  ];
  return (
    <div className="mt-16">
      <h3 className="font-display text-2xl tracking-tight">Compare plans</h3>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                Feature
              </th>
              {PLAN_ORDER.map((c) => (
                <th key={c} scope="col" className="px-5 py-3 text-left">
                  <span className="block font-semibold">{PLANS[c].name}</span>
                  <span className="block text-xs font-normal text-ink-faint">
                    {PLANS[c].monthlyPaise === 0
                      ? "₹0"
                      : `${formatINR(interval === "monthly" ? PLANS[c].monthlyPaise : yearlyPerMonthPaise(PLANS[c]))}/mo`}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-5 py-3 text-left font-medium text-ink-soft">
                  {r.label}
                </th>
                {r.values.map((v, i) => (
                  <td key={i} className="px-5 py-3">
                    {v === true ? (
                      <Check className="h-4 w-4 text-positive" aria-label="Included" />
                    ) : v === false ? (
                      <Minus className="h-4 w-4 text-ink-faint" aria-label="Not included" />
                    ) : (
                      <span className="tabular-nums">{v}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <div>
          <h3 className="font-display text-2xl tracking-tight">AI credits</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            1 credit per AI draft, 2 per brand extraction. Packs never expire.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {AI_CREDIT_PACKS.map((p) => (
            <div key={p.id} className="rounded-2xl border border-line bg-paper p-4">
              <p className="text-xs font-semibold text-ink-faint">{p.label}</p>
              <p className="mt-1 font-display text-2xl">{p.credits}</p>
              <p className="text-xs text-ink-soft">
                credits · {formatINR(p.paise)} · ₹{(p.paise / 100 / p.credits).toFixed(2)} each
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
