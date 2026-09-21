"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  FileUp,
  Globe,
  ImagePlus,
  Loader2,
  Palette,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import type { BrandKit, BrandKitInput, BrandProfile } from "@/lib/brand/types";
import { brandKitToTheme } from "@/lib/brand/types";
import { deleteBrandKit, saveBrandKit, setDefaultBrandKit } from "@/lib/brand/actions";
import { brandSampleForm } from "@/lib/brand/sample";
import { extractImagePalette } from "@/lib/brand/palette.client";
import { FONTS } from "@/lib/forms/fonts";
import { resolveTheme } from "@/lib/forms/themes";
import type { PlanCode } from "@/lib/plans";
import { PLANS, AI_COST_PER_BRAND_EXTRACTION } from "@/lib/plans";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import { uploadOwnerAsset } from "@/components/builder/AssetUpload";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

type Step = "sources" | "review";

interface SourceFile {
  fileId: string;
  name: string;
}

const EMPTY: BrandKitInput = {
  name: "",
  logoUrl: null,
  logoFileId: null,
  colors: { primary: "#0e7c5b", background: "#ffffff", text: "#1c1917", palette: [] },
  fonts: { heading: "fraunces", body: "inter", detected: [] },
  voice: { tone: "", audience: "", avoid: [], sample: "" },
  style: { radius: "lg", buttonStyle: "pill" },
  summary: "",
  sources: [],
};

function Swatch({ hex, label, onChange }: { hex: string; label: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2.5 rounded-xl border border-line bg-paper p-2">
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-line" style={{ background: hex }}>
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold">{label}</span>
        <span className="block font-mono text-[11px] uppercase text-ink-faint">{hex}</span>
      </span>
    </label>
  );
}

export function BrandStudio({
  kits,
  plan,
  aiConfigured,
  uploadsAvailable,
  balance: initialBalance,
  startNew,
}: {
  kits: BrandKit[];
  plan: PlanCode;
  aiConfigured: boolean;
  uploadsAvailable: boolean;
  balance: number;
  startNew?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<BrandKit | null | "new">(startNew && kits.length === 0 ? "new" : null);
  const [pending, start] = useTransition();
  const [listError, setListError] = useState<string | null>(null);
  const maxKits = PLANS[plan].entitlements.maxBrandKits;
  const canCreate = kits.length < maxKits;

  if (editing) {
    return (
      <KitEditor
        kit={editing === "new" ? null : editing}
        aiConfigured={aiConfigured}
        uploadsAvailable={uploadsAvailable}
        balance={initialBalance}
        onDone={() => {
          setEditing(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div>
      {listError && (
        <Notice tone="danger" className="mb-4">
          {listError}
        </Notice>
      )}
      {kits.length === 0 ? (
        <EmptyState
          icon={<Palette className="h-5 w-5" />}
          title="No brand kit yet"
          description="Upload your logo and guidelines (or just paste your website) and we'll pull out the colours, fonts and tone. Every form and AI draft can then wear your brand."
          action={
            <Button variant="accent" onClick={() => setEditing("new")}>
              <Sparkles className="h-4 w-4" /> Create your brand kit
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {kits.map((kit) => {
            const theme = resolveTheme(brandKitToTheme(kit));
            return (
              <Card key={kit.id} padded={false} className="overflow-hidden">
                <div className="flex h-24 items-end justify-between px-5 pb-3" style={{ background: kit.colors.background, color: kit.colors.text }}>
                  {kit.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={kit.logoUrl} alt="" className="max-h-10 max-w-[40%] object-contain" />
                  ) : (
                    <span className="text-lg font-semibold" style={{ fontFamily: theme.heading.stack }}>
                      {kit.name}
                    </span>
                  )}
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{ background: kit.colors.primary, color: theme.accentInk, borderRadius: kit.style.buttonStyle === "pill" ? 999 : kit.style.buttonStyle === "rounded" ? 10 : 4 }}
                  >
                    Button
                  </span>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold">
                        <span className="truncate">{kit.name}</span>
                        {kit.isDefault && <Badge tone="accent">Default</Badge>}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {FONTS.find((f) => f.id === kit.fonts.heading)?.label} · {FONTS.find((f) => f.id === kit.fonts.body)?.label}
                        {kit.voice.tone ? ` · ${kit.voice.tone}` : ""}
                      </p>
                    </div>
                    <div className="flex -space-x-1.5">
                      {[kit.colors.primary, kit.colors.secondary, ...kit.colors.palette]
                        .filter((c): c is string => Boolean(c))
                        .slice(0, 5)
                        .map((c, i) => (
                          <span key={i} className="h-6 w-6 rounded-full border-2 border-paper" style={{ background: c }} />
                        ))}
                    </div>
                  </div>
                  {kit.summary ? <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-soft">{kit.summary}</p> : null}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <ButtonLink href={`/create?kit=${kit.id}`} variant="accent" size="sm">
                      <Sparkles className="h-3.5 w-3.5" /> New form with this kit
                    </ButtonLink>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(kit)}>
                      Edit
                    </Button>
                    {!kit.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const res = await setDefaultBrandKit({ id: kit.id });
                            if (!res.ok) setListError(res.error);
                            router.refresh();
                          })
                        }
                      >
                        <Star className="h-3.5 w-3.5" /> Make default
                      </Button>
                    )}
                    <span className="flex-1" />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      className="text-danger hover:bg-danger-soft hover:text-danger"
                      onClick={() => {
                        if (!window.confirm(`Delete “${kit.name}”? Forms already styled with it keep their look.`)) return;
                        start(async () => {
                          const res = await deleteBrandKit({ id: kit.id });
                          if (!res.ok) setListError(res.error);
                          router.refresh();
                        });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => setEditing("new")}
            className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong p-6 text-sm font-semibold text-ink-soft transition-colors hover:border-ink/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-5 w-5" />
            {canCreate ? "Add another brand kit" : `${PLANS[plan].name} plan includes ${maxKits} kit${maxKits === 1 ? "" : "s"}`}
            {!canCreate && (
              <Link href="/billing" className="text-xs font-semibold underline underline-offset-2">
                Upgrade for more
              </Link>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function KitEditor({
  kit,
  aiConfigured,
  uploadsAvailable,
  balance: initialBalance,
  onDone,
}: {
  kit: BrandKit | null;
  aiConfigured: boolean;
  uploadsAvailable: boolean;
  balance: number;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>(kit ? "review" : "sources");
  const [draft, setDraft] = useState<BrandKitInput>(
    kit
      ? {
          name: kit.name,
          logoUrl: kit.logoUrl ?? null,
          logoFileId: kit.logoFileId ?? null,
          colors: kit.colors,
          fonts: kit.fonts,
          voice: kit.voice,
          style: kit.style,
          summary: kit.summary,
          sources: kit.sources,
          isDefault: kit.isDefault,
        }
      : EMPTY,
  );
  const [websiteUrl, setWebsiteUrl] = useState(kit?.sources.find((s) => s.type === "url")?.url ?? "");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [logoColors, setLogoColors] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extractNotes, setExtractNotes] = useState<string[]>([]);
  const [usedAi, setUsedAi] = useState<boolean | null>(null);
  const [balance, setBalance] = useState(initialBalance);
  const [saving, setSaving] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);

  const theme = useMemo(() => brandKitToTheme({ ...draft, logoUrl: draft.logoUrl }), [draft]);
  const resolved = useMemo(() => resolveTheme(theme), [theme]);
  const sample = useMemo(() => brandSampleForm(draft.name), [draft.name]);

  const patch = (p: Partial<BrandKitInput>) => setDraft((d) => ({ ...d, ...p }));
  const patchColors = (p: Partial<BrandKitInput["colors"]>) => setDraft((d) => ({ ...d, colors: { ...d.colors, ...p } }));
  const patchVoice = (p: Partial<BrandKitInput["voice"]>) => setDraft((d) => ({ ...d, voice: { ...d.voice, ...p } }));

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy("logo");
    try {
      const palette = await extractImagePalette(file).catch(() => []);
      setLogoColors(palette);
      const up = await uploadOwnerAsset(file, "brand_asset");
      if (up.ok && up.publicUrl) {
        patch({ logoUrl: up.publicUrl, logoFileId: up.fileId });
      } else if (!up.ok) {
        setError(up.unavailable ? "Storage isn't connected, so the logo can't be stored — but we read its colours." : up.error);
      }
    } finally {
      setBusy(null);
    }
  }

  async function onDocs(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setBusy("docs");
    try {
      for (const file of Array.from(list).slice(0, 5 - files.length)) {
        const up = await uploadOwnerAsset(file, "brand_source");
        if (!up.ok) {
          setError(up.unavailable ? "Storage isn't connected — paste the key parts of your guidelines in the notes instead." : up.error);
          break;
        }
        setFiles((f) => [...f, { fileId: up.fileId, name: file.name }]);
      }
    } finally {
      setBusy(null);
    }
  }

  async function extract() {
    setError(null);
    setBusy("extract");
    try {
      const res = await fetch("/api/brand/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name || undefined,
          websiteUrl: websiteUrl.trim() || undefined,
          text: notes.trim() || undefined,
          sourceFileIds: files.map((f) => f.fileId),
          logoColors,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        profile?: BrandProfile;
        usedAi?: boolean;
        balance?: number;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok || !data.profile) throw new Error(data?.error ?? "Extraction failed.");
      const p = data.profile;
      setDraft((d) => ({
        ...d,
        name: p.name || d.name,
        colors: p.colors,
        fonts: p.fonts,
        voice: p.voice,
        style: p.style,
        summary: p.summary,
        sources: [
          ...(websiteUrl.trim() ? [{ type: "url" as const, label: websiteUrl.trim(), url: websiteUrl.trim() }] : []),
          ...files.map((f) => ({ type: "pdf" as const, label: f.name, fileId: f.fileId })),
          ...(notes.trim() ? [{ type: "text" as const, label: "Notes" }] : []),
          ...(d.logoUrl ? [{ type: "logo" as const, label: "Logo", fileId: d.logoFileId ?? undefined }] : []),
        ],
      }));
      setExtractNotes(p.notes ?? []);
      setUsedAi(Boolean(data.usedAi));
      if (typeof data.balance === "number") setBalance(data.balance);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setError(null);
    setSaving(true);
    const res = await saveBrandKit({ id: kit?.id, input: { ...draft, name: draft.name.trim() || "My brand" } });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onDone();
  }

  const hasSources = Boolean(websiteUrl.trim() || notes.trim() || files.length || logoColors.length);

  return (
    <div>
      <button type="button" onClick={onDone} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> All brand kits
      </button>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <Segmented<Step>
            label="Brand kit steps"
            value={step}
            onChange={(s) => {
              if (s === "review" && !kit && !hasSources && !draft.summary) return;
              setStep(s);
            }}
            className="mb-5"
            options={[
              { value: "sources", label: "1 · Sources" },
              { value: "review", label: "2 · Review & save" },
            ]}
          />

          {error && (
            <Notice tone="danger" className="mb-4">
              {error}
            </Notice>
          )}

          {step === "sources" && (
            <Card className="flex flex-col gap-5">
              <Field label="Brand or company name">
                <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Kaveri Coffee Roasters" maxLength={80} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Logo</span>
                  {draft.logoUrl ? (
                    <div className="flex items-center gap-3 rounded-xl border border-line bg-paper-deep/40 p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={draft.logoUrl} alt="" className="h-12 w-20 rounded-lg bg-paper object-contain" />
                      <div className="flex-1 text-xs">
                        <div className="flex gap-1">
                          {logoColors.slice(0, 5).map((c) => (
                            <span key={c} className="h-4 w-4 rounded-full border border-line" style={{ background: c }} title={c} />
                          ))}
                        </div>
                        <button type="button" onClick={() => patch({ logoUrl: null, logoFileId: null })} className="mt-1 inline-flex items-center gap-1 font-semibold text-danger">
                          <X className="h-3 w-3" /> Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === "logo"}
                      onClick={() => logoInput.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-4 text-xs font-semibold text-ink-soft hover:border-ink/40 hover:text-ink disabled:opacity-60"
                    >
                      {busy === "logo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                      {busy === "logo" ? "Reading colours…" : "Upload logo (PNG, SVG, JPG)"}
                    </button>
                  )}
                  {logoColors.length > 0 && !draft.logoUrl && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-faint">
                      Colours read:
                      {logoColors.slice(0, 5).map((c) => (
                        <span key={c} className="h-4 w-4 rounded-full border border-line" style={{ background: c }} title={c} />
                      ))}
                    </div>
                  )}
                  <input
                    ref={logoInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="sr-only"
                    onChange={(e) => {
                      void onLogo(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>

                <Field label="Website" hint="We read colours, fonts and copy from the public page.">
                  <div className="relative">
                    <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                    <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://yourbrand.com" className="pl-9" />
                  </div>
                </Field>
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Brand guidelines (PDF or text)</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy === "docs" || files.length >= 5 || !uploadsAvailable}
                    onClick={() => docInput.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-xs font-semibold text-ink-soft hover:border-ink/40 hover:text-ink disabled:opacity-60"
                  >
                    {busy === "docs" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                    {uploadsAvailable ? "Upload guidelines" : "Uploads unavailable — use notes"}
                  </button>
                  {files.map((f) => (
                    <span key={f.fileId} className="inline-flex items-center gap-1.5 rounded-full bg-paper-deep px-3 py-1 text-xs font-medium">
                      {f.name}
                      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((l) => l.filter((x) => x.fileId !== f.fileId))} className="text-ink-faint hover:text-danger">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  ref={docInput}
                  type="file"
                  accept="application/pdf,text/plain,text/markdown"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    void onDocs(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>

              <Field label="Anything else we should know" hint="Tone of voice, words you avoid, hex codes, who your customers are…">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={20000} placeholder="We're a specialty coffee roaster in Bengaluru. Warm, a bit playful, never corporate. Brand green is #0E7C5B…" />
              </Field>

              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <Button variant="accent" onClick={extract} disabled={busy !== null || !hasSources}>
                  {busy === "extract" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {busy === "extract" ? "Reading your brand…" : "Extract brand"}
                </Button>
                <Button variant="ghost" onClick={() => setStep("review")}>
                  Skip — set it up manually
                </Button>
                <span className="text-xs text-ink-faint">
                  {aiConfigured
                    ? `${AI_COST_PER_BRAND_EXTRACTION} credits per extraction · ${balance} available`
                    : "AI isn't connected; extraction uses colour and font detection only."}
                </span>
              </div>
            </Card>
          )}

          {step === "review" && (
            <div className="flex flex-col gap-4">
              {extractNotes.length > 0 && (
                <Notice tone={usedAi ? "info" : "warn"} title={usedAi ? "What we found" : "Extracted without AI"}>
                  <ul className="list-disc pl-4">
                    {extractNotes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </Notice>
              )}
              <Card className="flex flex-col gap-4">
                <Field label="Kit name">
                  <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} maxLength={80} />
                </Field>
                <div>
                  <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Colours</span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Swatch hex={draft.colors.primary} label="Primary" onChange={(v) => patchColors({ primary: v })} />
                    <Swatch hex={draft.colors.secondary ?? draft.colors.primary} label="Secondary" onChange={(v) => patchColors({ secondary: v })} />
                    <Swatch hex={draft.colors.background} label="Background" onChange={(v) => patchColors({ background: v })} />
                    <Swatch hex={draft.colors.text} label="Text" onChange={(v) => patchColors({ text: v })} />
                  </div>
                  {(draft.colors.palette.length > 0 || logoColors.length > 0) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
                      Found:
                      {[...new Set([...draft.colors.palette, ...logoColors])].slice(0, 10).map((c) => (
                        <button
                          key={c}
                          type="button"
                          title={`Use ${c} as primary`}
                          onClick={() => patchColors({ primary: c })}
                          className="h-6 w-6 rounded-full border border-line ring-offset-2 hover:ring-2 hover:ring-ink/30"
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  )}
                  {resolved.warnings.length > 0 && <p className="mt-2 text-xs text-warn">{resolved.warnings[0]}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Heading font">
                    <Select value={draft.fonts.heading} onChange={(e) => setDraft((d) => ({ ...d, fonts: { ...d.fonts, heading: e.target.value } }))}>
                      {FONTS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Body font">
                    <Select value={draft.fonts.body} onChange={(e) => setDraft((d) => ({ ...d, fonts: { ...d.fonts, body: e.target.value } }))}>
                      {FONTS.filter((f) => f.category !== "display").map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {draft.fonts.detected.length > 0 && (
                  <p className="-mt-2 text-xs text-ink-faint">Detected in your sources: {draft.fonts.detected.join(", ")}</p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Corners</span>
                    <Segmented
                      label="Corner radius"
                      value={draft.style.radius}
                      onChange={(v) => setDraft((d) => ({ ...d, style: { ...d.style, radius: v } }))}
                      options={[
                        { value: "none" as const, label: "Sharp" },
                        { value: "sm" as const, label: "S" },
                        { value: "md" as const, label: "M" },
                        { value: "lg" as const, label: "L" },
                        { value: "xl" as const, label: "XL" },
                      ]}
                    />
                  </div>
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Buttons</span>
                    <Segmented
                      label="Button shape"
                      value={draft.style.buttonStyle}
                      onChange={(v) => setDraft((d) => ({ ...d, style: { ...d.style, buttonStyle: v } }))}
                      options={[
                        { value: "pill" as const, label: "Pill" },
                        { value: "rounded" as const, label: "Rounded" },
                        { value: "square" as const, label: "Square" },
                      ]}
                    />
                  </div>
                </div>
              </Card>

              <Card className="flex flex-col gap-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Voice — how the AI writes your questions</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Tone">
                    <Input value={draft.voice.tone} onChange={(e) => patchVoice({ tone: e.target.value })} placeholder="Warm, direct, a little playful" maxLength={300} />
                  </Field>
                  <Field label="Audience">
                    <Input value={draft.voice.audience} onChange={(e) => patchVoice({ audience: e.target.value })} placeholder="Coffee lovers aged 25–40 in Indian metros" maxLength={300} />
                  </Field>
                </div>
                <Field label="Words or phrasings to avoid" hint="Comma separated.">
                  <Input
                    value={draft.voice.avoid.join(", ")}
                    onChange={(e) => patchVoice({ avoid: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20) })}
                    placeholder="synergy, please be advised, exclamation marks"
                  />
                </Field>
                <Field label="Sample on-brand sentence">
                  <Textarea value={draft.voice.sample} onChange={(e) => patchVoice({ sample: e.target.value })} rows={2} maxLength={600} placeholder="Small batches, roasted this week, delivered before your Monday." />
                </Field>
                <Field label="Brand summary" hint="Two or three sentences a designer would need.">
                  <Textarea value={draft.summary} onChange={(e) => patch({ summary: e.target.value })} rows={3} maxLength={2000} />
                </Field>
              </Card>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="accent" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {kit ? "Save changes" : "Save brand kit"}
                </Button>
                {!kit && (
                  <Button variant="ghost" onClick={() => setStep("sources")}>
                    Back to sources
                  </Button>
                )}
                {kit && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={draft.isDefault ?? false} onChange={(e) => patch({ isDefault: e.target.checked })} className="h-4 w-4" />
                    Default kit for new AI drafts
                  </label>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Live preview */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Live preview</p>
          <div className={cn("overflow-hidden rounded-[1.75rem] border border-line shadow-lift")} style={{ background: resolved.background }}>
            <div className="min-h-[460px] px-7 py-9">
              <FormRenderer key={`${draft.colors.primary}-${draft.fonts.heading}-${draft.fonts.body}`} schema={sample} theme={theme} preview settings={{ autoAdvance: false }} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
