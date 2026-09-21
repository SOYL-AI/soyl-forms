import { ChevronDown } from "lucide-react";

export interface FaqItem {
  q: string;
  a: string;
}

export const HOME_FAQS: FaqItem[] = [
  {
    q: "How is this different from a Google Form?",
    a: "Respondents see one focused question at a time with keyboard-first navigation instead of a long scrolling page, which is why more people finish. You also get branching logic, brand-matched design, QR codes, webhooks, and an AI that drafts the whole form from a description.",
  },
  {
    q: "What does “brand-aware AI” actually do?",
    a: "You upload a logo, a brand-guidelines PDF, or paste your website once. We extract your colours, typography and tone of voice into a brand kit. From then on, describe a form in a sentence and the draft arrives already styled — right palette, right fonts, questions written in your voice — for you to review and publish.",
  },
  {
    q: "What does the free plan include?",
    a: "2 live forms, 250 responses a month, every question type, branching logic, QR codes, embeds, CSV export, 8 theme presets and 10 AI credits a month. No card needed. Custom colours and your logo publish on Starter.",
  },
  {
    q: "How do respondents open my form?",
    a: "Every published form gets a short link, an embed snippet, and a downloadable QR code (PNG and SVG) — on every plan. Scans are tagged so you can see how many responses came from print.",
  },
  {
    q: "How does billing work?",
    a: "Paid plans run on Razorpay subscriptions in INR — UPI, cards and netbanking — billed monthly or yearly. Cancel anytime; downgrading never deletes forms, responses or files, it only changes your limits.",
  },
  {
    q: "Is my respondents’ data safe?",
    a: "Responses are stored in a Postgres database with row-level security scoped to your workspace. File uploads live in a private bucket and are only ever served through short-lived, owner-authorised links. Public submissions go through a rate-limited server endpoint — never straight to the database.",
  },
];

export function Faq({ items, title = "Questions, answered" }: { items: FaqItem[]; title?: string }) {
  return (
    <div>
      <h2 className="font-display text-[2rem] leading-[1.08] tracking-tight sm:text-[2.6rem]">{title}</h2>
      <div className="mt-8 divide-y divide-line rounded-2xl border border-line bg-paper">
        {items.map((f) => (
          <details key={f.q} className="group px-6 py-4 open:bg-paper-deep/30">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold [&::-webkit-details-marker]:hidden">
              {f.q}
              <ChevronDown className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-soft">{f.a}</p>
          </details>
        ))}
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: items.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />
    </div>
  );
}
