import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getProductName } from "@/lib/config";

const ROWS: Array<[string, string, string[]]> = [
  [
    "A builder that previews the truth",
    "Three panes — outline, live preview, settings — with autosave and versioned publishes.",
    ["Add, reorder, duplicate, delete", "Live preview reuses the respondent renderer", "Invalid schemas can't publish"],
  ],
  [
    "A respondent experience worth finishing",
    "One question per screen, keyboard-first, gentle motion, honest progress.",
    ["Enter to advance, Shift+Enter for new lines", "Answers survive Back navigation and retries", "Respects reduced-motion settings"],
  ],
  [
    "Sharing built for the real world",
    "A short link, an embed snippet, and a QR code on every published form — even free ones.",
    ["PNG + SVG QR downloads", "qr-source attribution (?src=qr)", "Embed mode without outer chrome"],
  ],
  [
    "Responses you can act on",
    "A readable response list, per-question distributions, and CSV export that matches what you see.",
    ["Views, starts, completions, completion rate", "Choice and rating breakdowns", "Owner-authorized file downloads"],
  ],
  [
    "Billing in rupees, limits that hold",
    "Razorpay Subscriptions with server-side enforcement — the UI never decides what you've paid for.",
    ["₹199 Starter · ₹499 Pro, monthly or yearly", "Usage warnings before limits bite", "Downgrades keep your data"],
  ],
];

export default function FeaturesPage() {
  const name = getProductName();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-14">
        <h1 className="max-w-2xl font-display text-4xl leading-tight tracking-tight sm:text-5xl">
          Everything a form needs. Nothing it doesn&apos;t.
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-soft">
          {name} is built around one idea: the filling experience is the
          product. Everything else exists to get a great form in front of
          people.
        </p>
        <div className="mt-14 space-y-14">
          {ROWS.map(([title, lede, points], i) => (
            <section
              key={title}
              className={`grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:gap-12 ${i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}
            >
              <div>
                <p aria-hidden className="font-display text-sm text-brand-700">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h2 className="mt-1 font-display text-2xl tracking-tight sm:text-3xl">
                  {title}
                </h2>
                <p className="mt-3 leading-relaxed text-ink-soft">{lede}</p>
              </div>
              <ul className="divide-y divide-ink/10 self-start rounded-2xl border border-ink/10 bg-paper px-6">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-3 py-4 text-[15px]">
                    <span aria-hidden className="mt-0.5 font-bold text-brand-700">✓</span>
                    {p}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="mt-16 flex flex-wrap items-center gap-4">
          <Link
            href="/f/demo"
            className="rounded-full border border-ink/15 bg-white px-7 py-3.5 text-base font-semibold transition-colors hover:border-ink/30"
          >
            Feel it in the demo
          </Link>
          <Link
            href="/pricing"
            className="rounded-full bg-ink px-7 py-3.5 text-base font-semibold text-white"
          >
            See pricing
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
