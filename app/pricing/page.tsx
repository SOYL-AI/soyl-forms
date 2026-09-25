import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Section } from "@/components/marketing/primitives";
import { PricingTable } from "@/components/marketing/PricingTable";
import { Faq, type FaqItem } from "@/components/marketing/Faq";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free plan with 2 live forms and 250 responses a month. Starter ₹199/mo, Pro ₹499/mo, billed in INR via Razorpay. AI credits included on every plan.",
};

const BILLING_FAQS: FaqItem[] = [
  {
    q: "What happens when I hit a limit?",
    a: "We warn you at 80% and 95% of your monthly responses. At 100%, new responses pause and respondents see your closed message. Nothing is silently charged. Your live-form limit only affects publishing new forms — existing ones keep running.",
  },
  {
    q: "Can I change or cancel my plan?",
    a: "Yes, from Billing at any time. Cancelling keeps every form, response and file — only the limits return to Free at the end of your period. Upgrades apply immediately once Razorpay confirms payment.",
  },
  {
    q: "Which payment methods work?",
    a: "Anything Razorpay supports in India: UPI, credit and debit cards, netbanking and wallets. Yearly plans are charged once a year.",
  },
  {
    q: "Do AI credits roll over?",
    a: "Monthly plan credits reset each calendar month. Credits you buy in a pack never expire and are used after the monthly allowance runs out.",
  },
  {
    q: "Is there a Business plan?",
    a: "Not yet. If you need team seats, custom domains, or higher limits, write to us — we'll set up a plan that fits before we launch it publicly.",
  },
  {
    q: "Do you offer discounts for students or non-profits?",
    a: "The Free plan is generous on purpose. If you're running a student body, NGO or classroom and need more, email us with a short note about what you're doing.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-page px-5 pb-4 pt-16 text-center sm:px-6 lg:pt-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Pricing</p>
          <h1 className="mx-auto mt-3 max-w-2xl font-display text-[2.75rem] leading-[1.02] tracking-tightest sm:text-[3.6rem]">
            Simple pricing, in rupees.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
            Start free. Upgrade when your forms outgrow the limits. Yearly billing saves about two months.
          </p>
        </section>
        <Section>
          <PricingTable />
        </Section>
        <Section tone="paper">
          <div className="mx-auto max-w-3xl">
            <Faq items={BILLING_FAQS} title="Billing, plainly" />
          </div>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
