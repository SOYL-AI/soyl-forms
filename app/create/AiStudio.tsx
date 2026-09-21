"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Monitor, Pencil, RefreshCw, Smartphone, Sparkles, Wand2 } from "lucide-react";
import type { FormSchemaV1, FormSettings, FormTheme } from "@/types/forms";
import type { BrandKitSummary } from "@/lib/brand/types";
import { createFormFromDraft } from "@/lib/forms/actions";
import { resolveTheme } from "@/lib/forms/themes";
import { AI_COST_PER_DRAFT } from "@/lib/plans";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Segmented, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";

type Length = "short" | "medium" | "long";
type Device = "desktop" | "mobile";

interface Draft {
  schema: FormSchemaV1;
  theme: FormTheme;
  settings: FormSettings;
  logicDropped: boolean;
  rationale: string;
}

const EXAMPLES = [
  "Registration for our college hackathon: name, email, team size, track, dietary needs and a code-of-conduct consent",
  "Post-purchase feedback for a D2C skincare brand with an NPS score and a follow-up that depends on the score",
  "Job application for a frontend engineer: experience, portfolio link, CV upload, notice period",
  "Table-side feedback for a café — one rating, a grid for food, service and ambience, and whether they'd return",
  "Lead form for a wedding photography studio: date, venue city, package interest and budget range",
];

export function AiStudio({
  kits,
  initialKitId,
  balance: initialBalance,
  aiConfigured,
}: {
  kits: BrandKitSummary[];
  initialKitId: string | null;
  balance: number;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [kitId, setKitId] = useState<string | null>(initialKitId);
  const [length, setLength] = useState<Length>("medium");
  const [tone, setTone] = useState("");
  const [language, setLanguage] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [balance, setBalance] = useState(initialBalance);
  const [device, setDevice] = useState<Device>("desktop");

  const kit = kits.find((k) => k.id === kitId) ?? null;
  const resolved = useMemo(() => (draft ? resolveTheme(draft.theme) : null), [draft]);
  const canGenerate = aiConfigured && description.trim().length >= 10 && !busy && balance >= AI_COST_PER_DRAFT;

  async function generate() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description,
          brandKitId: kitId,
          length,
          tone: tone.trim() || undefined,
          language: language.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as (Partial<Draft> & { ok?: boolean; balance?: number; error?: string }) | null;
      if (typeof data?.balance === "number") setBalance(data.balance);
      if (!res.ok || !data?.ok || !data.schema) throw new Error(data?.error ?? "Generation failed.");
      setDraft({
        schema: data.schema,
        theme: data.theme ?? {},
        settings: data.settings ?? {},
        logicDropped: Boolean(data.logicDropped),
        rationale: data.rationale ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function openInBuilder() {
    if (!draft) return;
    setOpening(true);
    setError(null);
    const res = await createFormFromDraft({
      title: draft.schema.title,
      schema: draft.schema,
      theme: draft.theme,
      settings: draft.settings,
    });
    if (!res.ok) {
      setError(res.error);
      setOpening(false);
      return;
    }
    router.push(`/builder/${res.id}`);
  }

  const questionCount = draft ? draft.schema.blocks.filter((b) => !["welcome", "statement", "thank_you"].includes(b.type)).length : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Composer */}
      <div className="flex flex-col gap-4">
        {!aiConfigured && (
          <Notice tone="warn" title="AI isn't connected in this environment">
            The app owner needs to set an AI provider key (see <code>.env.example</code>). Templates and the builder work without it.
          </Notice>
        )}
        <Card className="flex flex-col gap-5">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-soft">Brand kit</span>
              <Link href={kits.length ? "/brand" : "/brand?new=1"} className="text-xs font-semibold text-ink underline underline-offset-2">
                {kits.length ? "Manage" : "Create a brand kit"}
              </Link>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setKitId(null)}
                aria-pressed={kitId === null}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  kitId === null ? "border-ink bg-ink text-paper" : "border-line-strong text-ink-soft hover:border-ink/40",
                )}
              >
                No brand — pick a theme for me
              </button>
              {kits.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKitId(k.id)}
                  aria-pressed={kitId === k.id}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    kitId === k.id ? "border-ink bg-ink text-paper" : "border-line-strong text-ink-soft hover:border-ink/40",
                  )}
                >
                  <span className="h-3 w-3 rounded-full border border-paper/40" style={{ background: k.colors.primary }} />
                  {k.name}
                </button>
              ))}
            </div>
            {kits.length === 0 && (
              <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                With a brand kit, the draft arrives in your colours, fonts and tone of voice — ready to publish.
              </p>
            )}
          </div>

          <Field label="Describe the form" hint="Who's answering, what you need to know, anything that should change based on an answer.">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              maxLength={3000}
              placeholder={EXAMPLES[0]}
              className="text-[15px]"
            />
          </Field>
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.slice(1).map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setDescription(ex)}
                className="max-w-full truncate rounded-full bg-paper-deep px-3 py-1 text-left text-[11px] font-medium text-ink-soft hover:text-ink"
                title={ex}
              >
                {ex.length > 64 ? `${ex.slice(0, 64)}…` : ex}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Length</span>
              <Segmented<Length>
                label="Form length"
                value={length}
                onChange={setLength}
                options={[
                  { value: "short", label: "Short · 3–5" },
                  { value: "medium", label: "Medium · 5–9" },
                  { value: "long", label: "Long · 9–14" },
                ]}
              />
            </div>
            <button type="button" onClick={() => setAdvanced((a) => !a)} className="mt-5 text-xs font-semibold text-ink-soft underline underline-offset-2 hover:text-ink">
              {advanced ? "Hide options" : "Tone & language"}
            </button>
          </div>
          {advanced && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tone override" hint="Leave blank to use the brand kit's voice.">
                <Input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Formal, playful, terse…" maxLength={80} />
              </Field>
              <Field label="Language">
                <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="English, Hindi, Hinglish…" maxLength={40} />
              </Field>
            </div>
          )}

          {error && (
            <Notice tone="danger">
              {error}{" "}
              {/credits/i.test(error) && (
                <Link href="/billing/credits" className="font-semibold underline underline-offset-2">
                  Top up
                </Link>
              )}
            </Notice>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button variant="accent" size="lg" onClick={generate} disabled={!canGenerate}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {busy ? "Drafting…" : draft ? "Generate again" : "Generate draft"}
            </Button>
            <span className="text-xs text-ink-faint">
              {AI_COST_PER_DRAFT} credit per draft ·{" "}
              <span className={cn("font-semibold", balance < AI_COST_PER_DRAFT ? "text-danger" : "text-ink")}>{balance} left</span>{" "}
              ·{" "}
              <Link href="/billing/credits" className="font-semibold underline underline-offset-2">
                Top up
              </Link>
            </span>
          </div>
        </Card>
        <p className="text-xs leading-relaxed text-ink-faint">
          Drafts land in your builder for review — nothing publishes automatically. Credits are only used when a draft is actually produced.
        </p>
      </div>

      {/* Preview */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {draft ? `Preview · ${questionCount} questions` : "Preview"}
          </p>
          <Segmented<Device>
            label="Preview device"
            value={device}
            onChange={setDevice}
            options={[
              { value: "desktop", label: <Monitor className="h-3.5 w-3.5" aria-label="Desktop" /> },
              { value: "mobile", label: <Smartphone className="h-3.5 w-3.5" aria-label="Mobile" /> },
            ]}
          />
        </div>
        {draft && resolved ? (
          <div className="mx-auto transition-[max-width]" style={{ maxWidth: device === "mobile" ? 400 : 720 }}>
            <div className="overflow-hidden rounded-[1.75rem] border border-line shadow-lift" style={{ background: resolved.background }}>
              <div className={cn("min-h-[520px]", device === "mobile" ? "px-6 py-9" : "px-9 py-11")}>
                <FormRenderer key={JSON.stringify(draft.schema.blocks.map((b) => b.id))} schema={draft.schema} theme={draft.theme} settings={draft.settings} preview />
              </div>
            </div>
            {(draft.rationale || draft.logicDropped) && (
              <p className="mt-3 text-xs leading-relaxed text-ink-soft">
                {draft.rationale}
                {draft.logicDropped ? " Some branching was simplified so the form stays valid — add rules back in the builder." : ""}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="primary" size="lg" onClick={openInBuilder} disabled={opening}>
                {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                {opening ? "Creating…" : "Open in builder"}
              </Button>
              <Button variant="secondary" onClick={generate} disabled={!canGenerate}>
                <RefreshCw className="h-4 w-4" /> Regenerate
              </Button>
              {kit && <span className="text-xs text-ink-faint">Styled with “{kit.name}”</span>}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[520px] flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-line-strong bg-paper/60 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-paper-deep text-ink-soft">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="mt-4 text-base font-semibold">Your draft appears here</p>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-soft">
              Fully interactive — click through it, check the copy, then open it in the builder to fine-tune and publish.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
