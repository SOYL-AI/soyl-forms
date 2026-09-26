import { ChevronDown } from "lucide-react";

export interface FaqItem {
  q: string;
  a: string;
}

export const HOME_FAQS: FaqItem[] = [
  {
    q: "How is this different from a Google Form?",
    a: "One question at a time instead of a long scrolling page, so more people finish. Plus branching, your branding, QR codes, webhooks and AI drafting.",
  },
  {
    q: "What does “brand-aware AI” actually do?",
    a: "Add your logo, guidelines PDF or website once. Every form you describe then arrives in your colours, fonts and tone, ready to review.",
  },
  {
    q: "What does the free plan include?",
    a: "2 live forms, 250 responses a month, every question type, logic, QR codes, embeds, CSV export and 10 AI credits a month. No card needed.",
  },
  {
    q: "How do respondents open my form?",
    a: "By short link, embed or QR code — on every plan.",
  },
  {
    q: "How does billing work?",
    a: "Monthly or yearly in INR through Razorpay — UPI, cards or netbanking. Cancel anytime; your data stays.",
  },
  {
    q: "Is my respondents’ data safe?",
    a: "Yes. Responses are private to your workspace, uploads are served only through expiring links, and submissions are rate-limited.",
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
