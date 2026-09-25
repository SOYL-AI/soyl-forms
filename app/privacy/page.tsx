import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getProductName, getSupportEmail } from "@/lib/config";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  const name = getProductName();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-16 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Legal</p>
        <h1 className="mt-3 font-display text-[2.5rem] leading-[1.05] tracking-tight">Privacy policy</h1>
        <p className="mt-2 text-sm text-ink-faint">Last updated 20 September 2026</p>
        <Notice tone="warn" className="mt-6">
          Draft for review by counsel before launch. It describes how the product actually works today.
        </Notice>
        <div className="prose-legal mt-4">
          <h2>Who we are</h2>
          <p>
            {name} is operated by SOYL AI (“we”). This policy covers the {name} website, the signed-in app, and public forms served at
            <code> /f/&lt;slug&gt;</code>. Questions: <a className="underline" href={`mailto:${getSupportEmail()}`}>{getSupportEmail()}</a>.
          </p>

          <h2>Two kinds of people use {name}</h2>
          <h3>Creators (account holders)</h3>
          <p>We store your email, an optional display name, your workspace, your forms and their versions, brand kits (including uploaded logos and guideline documents), billing status, and usage counters. Passwords are handled by our authentication provider (Supabase Auth) and are never visible to us.</p>
          <h3>Respondents (people answering a form)</h3>
          <p>We store the answers you submit, the time of submission, how long the form took, the source tag (for example “qr”), any URL parameters the creator chose to collect, and uploaded files. We do not require an account. Respondent data belongs to the creator who published the form; we process it on their behalf.</p>

          <h2>Where data lives</h2>
          <ul>
            <li>Database and authentication: Supabase (PostgreSQL) with row-level security scoped to each workspace.</li>
            <li>Uploaded files: Cloudflare R2 in a private bucket, served only through short-lived, authorised links.</li>
            <li>Payments: Razorpay. We never see or store card numbers or UPI credentials; we store subscription and payment identifiers.</li>
            <li>AI features: when a creator uses AI drafting or brand extraction, the form description, brand notes, extracted text from uploaded guideline documents and public website content are sent to the configured AI provider to generate a draft. Respondent answers are never sent to an AI provider.</li>
          </ul>

          <h2>Analytics and cookies</h2>
          <p>Signed-in pages and the marketing site may use privacy-respecting product analytics (Plausible or PostHog) when enabled. Public forms load no third-party analytics scripts. We use cookies only for authentication sessions and theme preference; public forms store your in-progress answers in your browser’s session storage so a refresh doesn’t lose them.</p>

          <h2>Retention and deletion</h2>
          <p>Creators can delete forms, responses and brand kits at any time from the app; deleting a workspace removes all of its data. Unattached respondent uploads are purged after 24 hours. Cancelling a paid plan never deletes data — only limits change. To request deletion of your account, email us.</p>

          <h2>Your rights</h2>
          <p>You can access, correct, export (CSV) and delete your data. Respondents should contact the creator who published the form first; if you can’t reach them, email us and we’ll help.</p>

          <h2>Changes</h2>
          <p>We’ll update this page and the date above when the policy changes. Material changes will be announced in the app.</p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
