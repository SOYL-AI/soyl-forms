import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getSupportEmail } from "@/lib/config";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  const email = getSupportEmail();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-16 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Contact</p>
        <h1 className="mt-3 font-display text-[2.5rem] leading-[1.05] tracking-tight">Talk to a person</h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-soft">
          Questions about plans, a bug, a feature you need, or a discount for your student body or NGO — email us. We read everything and reply within one working day.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card>
            <Mail className="h-5 w-5" />
            <h2 className="mt-3 font-semibold">Support & sales</h2>
            <p className="mt-1 text-sm text-ink-soft">Billing, limits, integrations, anything that blocks you.</p>
            <ButtonLink href={`mailto:${email}`} variant="secondary" className="mt-4">
              {email}
            </ButtonLink>
          </Card>
          <Card>
            <h2 className="font-semibold">Before you write</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
              <li>· Include your workspace email and the form link if it’s about a form.</li>
              <li>· For billing, include the Razorpay payment or subscription id.</li>
              <li>· Respondents: contact the form’s creator first — they own the responses.</li>
            </ul>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
