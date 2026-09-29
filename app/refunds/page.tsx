import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getProductName, getSupportEmail } from "@/lib/config";

export const metadata: Metadata = { title: "Refund and cancellation policy" };

export default function RefundsPage() {
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
        <h1 className="mt-3 font-display text-[2.5rem] leading-[1.05] tracking-tight">Refund and cancellation policy</h1>
        <p className="mt-2 text-sm text-ink-faint">Last updated 29 September 2026</p>
        <div className="prose-legal mt-8">
          <p>
            {name} is a digital subscription service; nothing is shipped physically. Your plan or credits are available in your account as
            soon as payment is confirmed.
          </p>

          <h2>Cancelling a subscription</h2>
          <p>
            You can cancel any time from <strong>Billing</strong> in the app. You won’t be charged again, and your plan stays active until
            the end of the period you’ve already paid for. After that, your account moves to the free plan. Your forms and responses are
            kept.
          </p>

          <h2>Refunds</h2>
          <ul>
            <li>
              <strong>Subscriptions:</strong> payments are non-refundable, including for partly used monthly or yearly periods, except where
              required by law.
            </li>
            <li>
              <strong>AI credit packs:</strong> purchases are final and non-refundable, whether or not the credits have been used. Purchased
              credits never expire.
            </li>
            <li>
              <strong>Billing errors:</strong> if you were charged twice or charged incorrectly, we’ll refund the extra amount in full.
            </li>
          </ul>

          <h2>How to request a refund</h2>
          <p>
            Email {mail} from your account email address with your payment ID and the reason for the request. We’ll reply within 3 business
            days. Approved refunds go back to your original payment method within 5–7 business days, depending on your bank.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
