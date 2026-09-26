"use client";

import { useMemo, useState } from "react";
import type { FormSchemaV1, FormTheme } from "@/types/forms";
import { resolveTheme } from "@/lib/forms/themes";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import { cn } from "@/lib/utils";

/**
 * Three illustrative brands re-theme the same form live. Sample brands are
 * labelled as such in the UI; the point is the mechanism, not the names.
 */
interface SampleBrand {
  id: string;
  name: string;
  kind: string;
  tone: string;
  theme: FormTheme;
}

const BRANDS: SampleBrand[] = [
  {
    id: "kaveri",
    name: "Kaveri Roasters",
    kind: "Specialty coffee",
    tone: "warm, artisanal, unhurried",
    theme: { background: "#f7f1e6", text: "#2b211b", accent: "#0e7c5b", headingFont: "fraunces", bodyFont: "work-sans", radius: "xl", buttonStyle: "pill" },
  },
  {
    id: "nimbus",
    name: "Nimbus Pay",
    kind: "Fintech",
    tone: "precise, confident, minimal",
    theme: { background: "#0f1424", text: "#eef1f8", accent: "#5b8cff", headingFont: "manrope", bodyFont: "manrope", radius: "md", buttonStyle: "rounded" },
  },
  {
    id: "rasa",
    name: "Rasa Studio",
    kind: "Yoga & wellness",
    tone: "soft, encouraging, calm",
    theme: { background: "#fdf5f3", text: "#3d2530", accent: "#c2506a", headingFont: "playfair", bodyFont: "lora", radius: "lg", buttonStyle: "pill" },
  },
];

function sampleForm(brand: SampleBrand): FormSchemaV1 {
  const copy: Record<string, { welcome: string; desc: string; q1: string; opts: string[]; q2: string; thanks: string }> = {
    kaveri: {
      welcome: "How was this week's roast?",
      desc: "Two sips' worth of questions. Helps us dial in the next batch.",
      q1: "How do you usually brew?",
      opts: ["Pour over", "French press", "Espresso", "Instant, honestly"],
      q2: "How did the flavour land?",
      thanks: "Thanks — a discount code for your next bag is on its way.",
    },
    nimbus: {
      welcome: "Help us improve payouts",
      desc: "Four questions. Under a minute. Read by the payments team.",
      q1: "What do you use Nimbus for most?",
      opts: ["Vendor payouts", "Salary runs", "Collections", "Reconciliation"],
      q2: "Rate the speed of your last settlement",
      thanks: "Received. We'll follow up if we need details.",
    },
    rasa: {
      welcome: "Welcome to the studio",
      desc: "A few gentle questions so we can plan your first class.",
      q1: "What brings you to practice?",
      opts: ["Flexibility", "Calm & focus", "Strength", "Recovery"],
      q2: "How would you rate your experience level?",
      thanks: "Lovely. See you on the mat.",
    },
  };
  const c = copy[brand.id] as (typeof copy)[string];
  return {
    schemaVersion: 1,
    title: brand.name,
    blocks: [
      { id: "w", type: "welcome", title: c.welcome, description: c.desc, buttonLabel: "Begin" },
      {
        id: "q1",
        type: "single_choice",
        title: c.q1,
        required: true,
        options: c.opts.map((label, i) => ({ id: `o${i}`, label })),
      },
      { id: "q2", type: "rating", title: c.q2, required: true, max: 5, icon: brand.id === "rasa" ? "heart" : "star" },
      { id: "t", type: "thank_you", title: c.thanks },
    ],
    logic: [],
  };
}

export function BrandShowcase() {
  const [active, setActive] = useState<SampleBrand>(BRANDS[0] as SampleBrand);
  const schema = useMemo(() => sampleForm(active), [active]);
  const resolved = useMemo(() => resolveTheme(active.theme), [active]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
      <div>
        <div role="tablist" aria-label="Sample brands" className="flex flex-col gap-2">
          {BRANDS.map((b) => {
            const on = b.id === active.id;
            const t = resolveTheme(b.theme);
            return (
              <button
                key={b.id}
                role="tab"
                aria-selected={on}
                type="button"
                onClick={() => setActive(b)}
                className={cn(
                  "flex items-center gap-4 rounded-2xl border p-3.5 text-left transition-all",
                  on ? "border-ink bg-paper shadow-card" : "border-line bg-paper/60 hover:border-ink/30",
                )}
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold"
                  style={{ background: t.background, color: t.accent, fontFamily: t.heading.stack, border: `1px solid ${t.accent}33` }}
                  aria-hidden
                >
                  {b.name.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{b.name}</span>
                  <span className="block text-xs text-ink-faint">{b.kind}</span>
                </span>
                <span className="flex -space-x-1.5" aria-hidden>
                  {[t.accent, t.background, t.text].map((c, i) => (
                    <span key={i} className="h-5 w-5 rounded-full border-2 border-paper" style={{ background: c }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-ink-faint">Sample brands</p>
      </div>
      <div
        className="overflow-hidden rounded-[1.75rem] border border-line shadow-lift transition-colors duration-300"
        style={{ background: resolved.background }}
      >
        <div className="flex items-center justify-between px-6 pt-5" style={{ color: resolved.text }}>
          <span className="text-sm font-semibold" style={{ fontFamily: resolved.heading.stack }}>
            {active.name}
          </span>
        </div>
        <div className="px-6 pb-8 pt-6 sm:px-9">
          <FormRenderer key={active.id} schema={schema} theme={active.theme} preview minimal />
        </div>
      </div>
    </div>
  );
}
