import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getProductName, getSupportEmail } from "@/lib/config";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  const name = getProductName();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-16 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Legal</p>
        <h1 className="mt-3 font-display text-[2.5rem] leading-[1.05] tracking-tight">Terms of service</h1>
        <p className="mt-2 text-sm text-ink-faint">Last updated 20 September 2026</p>
        <Notice tone="warn" className="mt-6">
          Draft for review by counsel before launch.
        </Notice>
        <div className="prose-legal mt-4">
          <h2>The service</h2>
          <p>{name} lets you build, publish and collect responses to online forms. By creating an account you agree to these terms on behalf of yourself or the organisation you represent.</p>

          <h2>Plans, payment and limits</h2>
          <p>Free and paid plans are described on the pricing page. Paid plans are billed in Indian rupees through Razorpay, monthly or yearly, and renew automatically until cancelled. Limits (live forms, monthly responses, storage) are enforced by the service; when a limit is reached, new submissions pause until the next period or an upgrade. Prices may change with at least 30 days’ notice; changes apply from your next renewal.</p>

          <h2>Your content and your respondents</h2>
          <p>You own your forms and the responses you collect. You are responsible for having a lawful basis to collect what you ask for, for telling respondents how you’ll use it, and for honouring their requests. We process respondent data only to provide the service.</p>

          <h2>Acceptable use</h2>
          <ul>
            <li>No forms that collect payment card numbers, government IDs or passwords in plain text fields.</li>
            <li>No phishing, impersonation of other organisations, harassment, or unlawful content.</li>
            <li>No attempts to bypass rate limits, plan limits, or other people’s workspaces.</li>
          </ul>
          <p>We may suspend forms or workspaces that violate these rules. Where practical we’ll notify you and preserve your data so you can export it.</p>

          <h2>AI features</h2>
          <p>AI-generated drafts are suggestions you review before publishing. You’re responsible for the content of anything you publish. AI credits included with a plan reset monthly; purchased credits don’t expire but are non-refundable once used.</p>

          <h2>Availability and support</h2>
          <p>We aim for high availability but don’t guarantee uninterrupted service. Support is by email at <a className="underline" href={`mailto:${getSupportEmail()}`}>{getSupportEmail()}</a>.</p>

          <h2>Liability</h2>
          <p>To the extent permitted by law, our total liability for any claim relating to the service is limited to the fees you paid us in the twelve months before the claim.</p>

          <h2>Ending the agreement</h2>
          <p>You can cancel any time from Billing; your data remains available on the Free plan’s limits. You may delete your account by emailing us. We may end the agreement for violations of these terms.</p>

          <h2>Governing law</h2>
          <p>These terms are governed by the laws of India. Disputes will be handled in the courts of the city where SOYL AI is registered.</p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
