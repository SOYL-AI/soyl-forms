import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Notice } from "@/components/ui/notice";
import { getProductName, getSupportEmail } from "@/lib/config";

export const metadata: Metadata = { title: "Delete your account" };

/** Public account-deletion page (the URL Google Play's Data safety form asks for). */
export default function DeleteAccountPage({ searchParams }: { searchParams?: { done?: string } }) {
  const name = getProductName();
  const email = getSupportEmail();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-16 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Account</p>
        <h1 className="mt-3 font-display text-[2.5rem] leading-[1.05] tracking-tight">Delete your {name} account</h1>
        {searchParams?.done === "1" && (
          <Notice tone="positive" className="mt-6" title="Your account has been deleted">
            Your account, workspace and data have been removed. Thanks for trying {name}.
          </Notice>
        )}
        <div className="prose-legal mt-8">
          <h2>In the app or on the website</h2>
          <ol className="list-decimal pl-5">
            <li>
              Sign in and open <strong>Account</strong> (or go to{" "}
              <Link className="underline" href="/account">
                /account
              </Link>
              ).
            </li>
            <li>
              Under <strong>Delete account</strong>, choose <strong>Delete account</strong>.
            </li>
            <li>
              Type <strong>DELETE</strong> and confirm.
            </li>
          </ol>
          <p>Your account is deleted immediately and any paid plan is cancelled.</p>

          <h2>Can’t sign in?</h2>
          <p>
            Email{" "}
            <a className="underline" href={`mailto:${email}?subject=Delete%20my%20account`}>
              {email}
            </a>{" "}
            from the address you signed up with and ask us to delete your account. We’ll confirm it’s you and delete it within 30 days.
          </p>

          <h2>What’s deleted</h2>
          <ul>
            <li>Your account, profile and sign-in details</li>
            <li>Your workspace, forms, form versions and brand kits</li>
            <li>All responses to your forms, and every uploaded file</li>
            <li>Your usage history and AI credits</li>
          </ul>

          <h2>What we keep</h2>
          <p>
            Payment and invoice records are kept for as long as tax law requires. They’re held by our payment
            provider, Razorpay, and aren’t used for anything else. If you created forms in someone else’s workspace, those forms stay with
            that workspace without your name.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
