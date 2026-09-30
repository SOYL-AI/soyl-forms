import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getProductName, getSupportEmail } from "@/lib/config";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  const name = getProductName();
  const email = getSupportEmail();
  const mail = (
    <a className="underline" href={`mailto:${email}`}>
      {email}
    </a>
  );
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-16 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Legal</p>
        <h1 className="mt-3 font-display text-[2.5rem] leading-[1.05] tracking-tight">Terms of service</h1>
        <p className="mt-2 text-sm text-ink-faint">Last updated 29 September 2026</p>
        <div className="prose-legal mt-8">
          <p>
            These terms govern your use of {name}, provided by SOYL AI (“we”, “us”). By creating an account or using the service, you agree
            to them on behalf of yourself or the organisation you represent. If you don’t agree, please don’t use {name}.
          </p>

          <h2>1. Your account</h2>
          <p>
            You must be at least 18 years old and provide accurate information. You’re responsible for keeping your login secure and for
            all activity under your account. Tell us promptly at {mail} if you suspect unauthorised access.
          </p>

          <h2>2. Plans and payment</h2>
          <p>
            {name} offers a free plan and paid plans, as described on our{" "}
            <Link className="underline" href="/pricing">
              pricing page
            </Link>
            . Paid plans are billed in Indian rupees through Razorpay, monthly or yearly, and renew automatically until cancelled. We may change prices with at least 30 days’ notice; changes apply from your
            next renewal.
          </p>
          <p>
            Each plan has usage limits, such as live forms, monthly responses and storage. When you reach a limit, new responses pause until
            the next billing period or until you upgrade. We never charge you automatically for going over a limit.
          </p>

          <h2>3. Cancellation and refunds</h2>
          <p>
            You can cancel at any time from Billing. Your plan stays active until the end of the period you’ve paid for, then moves to the
            free plan. Your forms and responses are kept. Refunds are handled under our{" "}
            <Link className="underline" href="/refunds">
              Refund and cancellation policy
            </Link>
            .
          </p>

          <h2>4. Your content</h2>
          <p>
            You own the forms you create and the responses you collect. You give us permission to host, process and display that content
            only as needed to provide the service to you.
          </p>
          <p>
            When you collect responses, you are responsible for having a lawful basis to collect the information, telling respondents how
            you’ll use it, and honouring their requests about their data.
          </p>

          <h2>5. Acceptable use</h2>
          <p>You agree not to use {name} to:</p>
          <ul>
            <li>collect passwords, full payment card numbers or government ID numbers;</li>
            <li>phish, impersonate others, or mislead respondents about who is collecting their data;</li>
            <li>send spam, harass anyone, or publish unlawful, harmful or infringing content;</li>
            <li>interfere with the service, bypass its limits, or access other people’s accounts or data.</li>
          </ul>
          <p>
            We may remove content or suspend accounts that break these rules. Where possible, we’ll notify you first and give you a chance
            to export your data.
          </p>

          <h2>6. AI features</h2>
          <p>
            AI-generated drafts are suggestions. Review them before publishing; you are responsible for anything you publish. AI credits
            included with a plan reset each month. Purchased credit packs don’t expire.
          </p>

          <h2>7. Our service</h2>
          <p>
            {name}, including its software and design, belongs to SOYL AI. We work to keep the service available and secure, but it is
            provided “as is”, and we don’t guarantee it will be uninterrupted or error-free. We may improve or change features over time.
          </p>

          <h2>8. Limitation of liability</h2>
          <p>
            To the extent permitted by law, we are not liable for indirect or consequential losses, such as lost profits or lost data, and
            our total liability for any claim relating to the service is limited to the amount you paid us in the 12 months before the
            claim.
          </p>

          <h2>9. Ending these terms</h2>
          <p>
            You can stop using {name} and delete your account at any time from Account settings, or by emailing {mail}. We may suspend or end
            your access if
            you seriously or repeatedly breach these terms.
          </p>

          <h2>10. Changes to these terms</h2>
          <p>
            We may update these terms from time to time. We’ll notify you of significant changes by email or in the app before they take
            effect. Continuing to use {name} after that means you accept the updated terms.
          </p>

          <h2>11. Governing law</h2>
          <p>These terms are governed by the laws of India, and disputes are subject to the jurisdiction of the courts of India.</p>

          <h2>12. Contact</h2>
          <p>Questions about these terms? Email us at {mail}.</p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
