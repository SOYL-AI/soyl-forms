import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getSupportEmail } from "@/lib/config";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  const email = getSupportEmail();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 pb-28 pt-20 text-center sm:px-6 lg:pt-28">
        <h1 className="font-display text-[2.75rem] leading-[1.02] tracking-tightest sm:text-[3.6rem]">Talk to a person</h1>
        <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-ink-soft">
          Plans, bugs, feature requests or discounts. We reply within one working day.
        </p>
        <ButtonLink href={`mailto:${email}`} variant="accent" size="lg" className="mt-9">
          <Mail className="h-4 w-4" /> {email}
        </ButtonLink>
      </main>
      <SiteFooter />
    </div>
  );
}
