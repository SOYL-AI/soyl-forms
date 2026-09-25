"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Lock, Palette, Sparkles } from "lucide-react";
import type { ButtonStyle, FormTheme, ThemeRadius } from "@/types/forms";
import { THEME_PRESETS, resolveTheme } from "@/lib/forms/themes";
import { FONTS } from "@/lib/forms/fonts";
import { brandKitToTheme, type BrandKitSummary } from "@/lib/brand/types";
import { PLANS, type PlanCode } from "@/lib/plans";
import { Field, Input, Segmented, Select } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { AssetUpload } from "./AssetUpload";
import { cn } from "@/lib/utils";

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} picker`}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-line-strong bg-paper p-0.5"
        />
        <Input
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toLowerCase());
          }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (!/^#[0-9a-fA-F]{6}$/.test(v)) e.target.value = value;
          }}
          defaultValue={value}
          key={value}
          maxLength={7}
          className="font-mono !py-1.5 text-xs uppercase"
          aria-label={`${label} hex`}
        />
      </div>
    </Field>
  );
}

export function DesignPanel({
  theme,
  onThemePatch,
  onThemeReplace,
  brandKits,
  plan,
  formId,
}: {
  theme: FormTheme;
  onThemePatch: (p: Partial<FormTheme>) => void;
  onThemeReplace: (t: FormTheme) => void;
  brandKits: BrandKitSummary[];
  plan: PlanCode;
  formId: string;
}) {
  const resolved = useMemo(() => resolveTheme(theme), [theme]);
  const customAllowed = PLANS[plan].entitlements.customThemes;
  const activeKit = brandKits.find((k) => k.id === theme.brandKitId);

  return (
    <div className="flex flex-col gap-5">
      {/* Brand kits */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            <Sparkles className="h-3 w-3" /> Brand kit
          </p>
          <Link href="/brand" className="text-xs font-semibold text-ink underline underline-offset-2">
            {brandKits.length ? "Manage" : "Create one"}
          </Link>
        </div>
        {brandKits.length === 0 ? (
          <p className="text-xs leading-relaxed text-ink-faint">
            Upload your logo and guidelines once; every form (and every AI draft) can pick up your colours, fonts and tone.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {brandKits.map((kit) => {
              const active = kit.id === theme.brandKitId;
              return (
                <button
                  key={kit.id}
                  type="button"
                  onClick={() => onThemeReplace(brandKitToTheme(kit))}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                    active ? "border-ink bg-paper-deep/60" : "border-line hover:border-ink/40",
                  )}
                >
                  <span className="flex -space-x-1.5">
                    {[kit.colors.primary, kit.colors.background, kit.colors.text].map((c, i) => (
                      <span key={i} className="h-5 w-5 rounded-full border border-paper" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{kit.name}</span>
                    <span className="block text-[11px] text-ink-faint">
                      {FONTS.find((f) => f.id === kit.fonts.heading)?.label} · {FONTS.find((f) => f.id === kit.fonts.body)?.label}
                    </span>
                  </span>
                  <span className="text-xs font-semibold">{active ? "Applied" : "Apply"}</span>
                </button>
              );
            })}
          </div>
        )}
        {activeKit && (
          <p className="mt-1.5 text-[11px] text-ink-faint">
            Changing colours below detaches this form from “{activeKit.name}”.
          </p>
        )}
      </section>

      {/* Presets */}
      <section>
        <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          <Palette className="h-3 w-3" /> Presets
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {THEME_PRESETS.map((preset) => {
            const active =
              theme.accent?.toLowerCase() === preset.theme.accent.toLowerCase() &&
              theme.background?.toLowerCase() === preset.theme.background.toLowerCase();
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onThemeReplace({ ...preset.theme, logoUrl: theme.logoUrl, logoPlacement: theme.logoPlacement })}
                aria-pressed={active}
                title={preset.name}
                className={cn(
                  "rounded-xl border p-1.5 text-left transition-all",
                  active ? "border-ink ring-2 ring-ink/10" : "border-line hover:border-ink/40",
                )}
                style={{ backgroundColor: preset.theme.background }}
              >
                <span className="block h-5 rounded-md" style={{ backgroundColor: preset.theme.accent }} aria-hidden />
                <span className="mt-1 block truncate text-[10px] font-semibold" style={{ color: preset.theme.text }}>
                  {preset.name}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Colors */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Colours</p>
          {!customAllowed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-ink dark:text-accent">
              <Lock className="h-3 w-3" /> Starter+ to publish
            </span>
          )}
        </div>
        <div className="grid gap-2">
          <ColorField label="Accent" value={resolved.accent} onChange={(v) => onThemePatch({ accent: v, brandKitId: undefined })} />
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Background" value={resolved.background} onChange={(v) => onThemePatch({ background: v, brandKitId: undefined })} />
            <ColorField label="Text" value={resolved.text} onChange={(v) => onThemePatch({ text: v, brandKitId: undefined })} />
          </div>
        </div>
        {resolved.warnings.length > 0 && (
          <Notice tone="warn" className="mt-2 !py-2 text-xs">
            {resolved.warnings[0]}
          </Notice>
        )}
      </section>

      {/* Type */}
      <section className="grid grid-cols-2 gap-2">
        <Field label="Heading font">
          <Select value={theme.headingFont ?? resolved.heading.id} onChange={(e) => onThemePatch({ headingFont: e.target.value, font: undefined })}>
            {(["serif", "display", "sans", "mono"] as const).map((cat) => (
              <optgroup key={cat} label={cat === "sans" ? "Sans" : cat === "serif" ? "Serif" : cat === "display" ? "Display" : "Mono"}>
                {FONTS.filter((f) => f.category === cat).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Body font">
          <Select value={theme.bodyFont ?? resolved.body.id} onChange={(e) => onThemePatch({ bodyFont: e.target.value })}>
            {(["sans", "serif", "mono"] as const).map((cat) => (
              <optgroup key={cat} label={cat === "sans" ? "Sans" : cat === "serif" ? "Serif" : "Mono"}>
                {FONTS.filter((f) => f.category === cat).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      </section>

      {/* Shape */}
      <section className="grid gap-3">
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Corners</span>
          <Segmented<ThemeRadius>
            label="Corner radius"
            value={theme.radius ?? "lg"}
            onChange={(v) => onThemePatch({ radius: v })}
            options={[
              { value: "none", label: "Sharp" },
              { value: "sm", label: "S" },
              { value: "md", label: "M" },
              { value: "lg", label: "L" },
              { value: "xl", label: "XL" },
            ]}
          />
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Buttons</span>
          <Segmented<ButtonStyle>
            label="Button shape"
            value={theme.buttonStyle ?? "pill"}
            onChange={(v) => onThemePatch({ buttonStyle: v })}
            options={[
              { value: "pill", label: "Pill" },
              { value: "rounded", label: "Rounded" },
              { value: "square", label: "Square" },
            ]}
          />
        </div>
      </section>

      {/* Logo */}
      <section className="grid gap-3">
        <AssetUpload
          label={customAllowed ? "Logo" : "Logo (Starter+ to publish)"}
          hint="Shown at the top of every screen."
          kind="brand_asset"
          formId={formId}
          value={theme.logoUrl}
          onChange={(url) => onThemePatch({ logoUrl: url })}
          compact
        />
        {theme.logoUrl && (
          <Segmented<"top-left" | "top-center">
            label="Logo placement"
            value={theme.logoPlacement ?? "top-left"}
            onChange={(v) => onThemePatch({ logoPlacement: v })}
            options={[
              { value: "top-left", label: "Left" },
              { value: "top-center", label: "Centered" },
            ]}
          />
        )}
      </section>

      {!customAllowed && (
        <Notice tone="info" className="text-xs">
          Design freely — custom colours and a logo publish on Starter (₹199/mo). Presets publish on Free.{" "}
          <Link href="/billing" className="font-semibold underline underline-offset-2">
            Upgrade
          </Link>
        </Notice>
      )}
    </div>
  );
}
