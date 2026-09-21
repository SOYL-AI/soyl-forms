import Link from "next/link";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { BrandLockup } from "@/components/brand";
import { RadialLines } from "@/components/marketing/primitives";

const POINTS = [
  "Describe a form; get it drafted in your brand",
  "One question at a time — more people finish",
  "Link, QR code and embed on every plan",
  "Free forever for 2 live forms. No card.",
];

/** Two-panel auth layout: product story left, form right. Stacks on phones. */
export function AuthShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink text-paper lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -bottom-64 -left-48 h-[900px] w-[900px] text-paper/[0.06]">
          <RadialLines className="inset-0 h-full w-full" />
        </div>
        <div className="relative">
          <BrandLockup />
        </div>
        <div className="relative max-w-md">
          <h2 className="font-display text-[2.6rem] leading-[1.05] tracking-tight">Forms people actually finish.</h2>
          <ul className="mt-8 space-y-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-[15px] text-paper/80">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
                  <Check className="h-3 w-3" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-paper/50">© {new Date().getFullYear()} SOYL AI · Razorpay billing in INR</p>
      </aside>
      <main className="flex flex-col px-5 py-8 sm:px-10 lg:justify-center lg:px-16">
        <div className="mb-10 lg:hidden">
          <BrandLockup />
        </div>
        <div className="mx-auto w-full max-w-md">
          <h1 className="font-display text-3xl tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-10 text-xs leading-relaxed text-ink-faint">
            By continuing you agree to the{" "}
            <Link href="/terms" className="underline underline-offset-2">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
