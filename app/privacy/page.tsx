import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getProductName, getSupportEmail } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
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
        <h1 className="mt-3 font-display text-[2.5rem] leading-[1.05] tracking-tight">Privacy policy</h1>
        <p className="mt-2 text-sm text-ink-faint">Last updated 29 September 2026</p>
        <div className="prose-legal mt-8">
          <p>
            This policy explains how SOYL AI (“we”, “us”) collects, uses and protects personal information when you use {name}, including
            our website, the {name} app and the forms our customers publish with it.
          </p>

          <h2>Information we collect</h2>
          <h3>If you have an account</h3>
          <ul>
            <li>Your name and email address, and your profile details if you sign in with Google.</li>
            <li>The forms, brand kits, logos, documents and other content you create or upload.</li>
            <li>Your plan, billing history and usage of the service.</li>
            <li>Basic technical information such as IP address, browser type and log data, used to keep the service secure.</li>
          </ul>
          <p>Passwords are handled by our authentication provider and are never visible to us.</p>
          <h3>If you answer a form</h3>
          <p>
            We store the answers and files you submit, along with the submission time and basic technical information. You don’t need an
            account to answer a form. Responses belong to the person or organisation that published the form; we process them on their
            behalf and according to their instructions.
          </p>

          <h2>How we use information</h2>
          <ul>
            <li>To provide, maintain and improve {name}.</li>
            <li>To process payments and manage subscriptions.</li>
            <li>To send service emails, such as sign-in links, response notifications and billing receipts.</li>
            <li>To prevent abuse, fraud and security incidents.</li>
            <li>To comply with legal obligations.</li>
          </ul>
          <p>We do not sell personal information, and we do not use form responses for advertising.</p>

          <h2>AI features</h2>
          <p>
            When you use AI drafting or brand extraction, the description, notes, documents or website you provide are sent to our AI
            provider to generate a result. Answers submitted by respondents are never sent to an AI provider, and our providers do not use
            this data to train their models.
          </p>

          <h2>Service providers</h2>
          <p>We share information only with providers that help us run {name}, under contracts that protect it:</p>
          <ul>
            <li>Supabase — database and authentication</li>
            <li>Cloudflare — file storage</li>
            <li>Vercel — hosting</li>
            <li>Razorpay — payments (we never see or store your card or UPI details)</li>
            <li>Resend — email delivery</li>
            <li>Microsoft Azure — AI features</li>
          </ul>
          <p>
            Some of these providers may process data outside India. We may also disclose information when required by law or to protect
            the rights and safety of our users.
          </p>

          <h2>Cookies</h2>
          <p>
            We use essential cookies to keep you signed in and remember your display preferences. Published forms do not load advertising
            or third-party tracking scripts.
          </p>

          <h2>Retention</h2>
          <p>
            We keep your information for as long as your account is active. You can delete forms, responses and brand kits at any time,
            and delete your whole account from Account settings in the app or on the website (see{" "}
            <Link className="underline" href="/delete-account">
              how to delete your account
            </Link>
            ). Account deletion is immediate, except for records such as invoices that we must keep by law.
          </p>

          <h2>Security</h2>
          <p>
            Data is encrypted in transit and access is restricted to your workspace. Uploaded files are stored privately and shared only
            through short-lived links. No system is perfectly secure, but we work to protect your information and will notify you of any
            breach as required by law.
          </p>

          <h2>Your rights</h2>
          <p>
            Under applicable law, including India’s Digital Personal Data Protection Act, 2023, you can request access to, correction of or
            deletion of your personal data, and withdraw consent where we rely on it. Email us at {mail}. If you answered a form, please
            contact the form’s publisher first; if you can’t reach them, we’ll help.
          </p>

          <h2>Children</h2>
          <p>{name} is not intended for children under 18, and we do not knowingly collect their personal data.</p>

          <h2>Changes to this policy</h2>
          <p>
            We’ll update this page when the policy changes and notify account holders of significant changes by email or in the app.
          </p>

          <h2>Contact and grievances</h2>
          <p>
            For privacy questions or complaints, contact our Grievance Officer at {mail}. We’ll respond within 30 days. See also our{" "}
            <Link className="underline" href="/terms">
              Terms of service
            </Link>
            .
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
