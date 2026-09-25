import type { CSSProperties } from "react";
import type { ButtonStyle, FormTheme, ThemeRadius } from "@/types/forms";
import { alpha, contrastRatio, ensureContrast, isDark, mix, normalizeHex, readableOn } from "./color";
import { googleFontsHref, resolveFontIds, type FontDef } from "./fonts";

export interface ThemePreset {
  id: string;
  name: string;
  theme: Required<Pick<FormTheme, "background" | "text" | "accent">> &
    Pick<FormTheme, "font" | "buttonStyle" | "headingFont" | "bodyFont" | "radius">;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "forest",
    name: "Forest",
    theme: { background: "#FFFFFF", text: "#1C1917", accent: "#0E7C5B", headingFont: "fraunces", bodyFont: "inter", buttonStyle: "pill", radius: "lg" },
  },
  {
    id: "ocean",
    name: "Ocean",
    theme: { background: "#F7FAFC", text: "#1A2B3C", accent: "#1565C0", headingFont: "manrope", bodyFont: "manrope", buttonStyle: "rounded", radius: "md" },
  },
  {
    id: "terracotta",
    name: "Terracotta",
    theme: { background: "#FDF8F3", text: "#3B2A20", accent: "#C05621", headingFont: "dm-serif", bodyFont: "work-sans", buttonStyle: "pill", radius: "xl" },
  },
  {
    id: "slate",
    name: "Slate",
    theme: { background: "#F8FAFC", text: "#0F172A", accent: "#334155", headingFont: "ibm-plex-sans", bodyFont: "ibm-plex-sans", buttonStyle: "square", radius: "sm" },
  },
  {
    id: "rose",
    name: "Rose",
    theme: { background: "#FDF6F7", text: "#3B1F2B", accent: "#BE123C", headingFont: "playfair", bodyFont: "lora", buttonStyle: "pill", radius: "lg" },
  },
  {
    id: "midnight",
    name: "Midnight",
    theme: { background: "#101418", text: "#F1F5F9", accent: "#38BDF8", headingFont: "space-grotesk", bodyFont: "inter", buttonStyle: "pill", radius: "md" },
  },
  {
    id: "marigold",
    name: "Marigold",
    theme: { background: "#141414", text: "#F5F1E8", accent: "#F2B418", headingFont: "outfit", bodyFont: "dm-sans", buttonStyle: "rounded", radius: "lg" },
  },
  {
    id: "paper",
    name: "Paper",
    theme: { background: "#F6F1E7", text: "#2B2520", accent: "#8A5A2B", headingFont: "libre-baskerville", bodyFont: "merriweather", buttonStyle: "square", radius: "none" },
  },
];

export const DEFAULT_THEME: FormTheme = {
  background: "#FFFFFF",
  text: "#1C1917",
  accent: "#0E7C5B",
  headingFont: "fraunces",
  bodyFont: "inter",
  buttonStyle: "pill",
  radius: "lg",
};

const RADIUS_PX: Record<ThemeRadius, number> = { none: 0, sm: 6, md: 10, lg: 14, xl: 20 };
const BUTTON_RADIUS: Record<ButtonStyle, string> = {
  pill: "999px",
  rounded: "12px",
  square: "4px",
};

export interface ResolvedTheme {
  background: string;
  text: string;
  accent: string;
  accentInk: string;
  buttonStyle: ButtonStyle;
  radius: ThemeRadius;
  heading: FontDef;
  body: FontDef;
  logoUrl?: string;
  logoPlacement: "top-left" | "top-center";
  /** Whether the palette is dark-on-light or light-on-dark. */
  dark: boolean;
  /** Contrast issues that were auto-corrected, for builder hints. */
  warnings: string[];
}

/**
 * Turn a stored theme into a complete, legible set of values. Text is
 * pushed to ≥4.5:1 against the background and the accent to ≥3:1, so a
 * pasted brand palette never produces unreadable forms.
 */
export function resolveTheme(raw: unknown): ResolvedTheme {
  const t = (raw ?? {}) as FormTheme;
  const warnings: string[] = [];
  const background = normalizeHex(t.background ?? "") ?? (DEFAULT_THEME.background as string);
  const textIn = normalizeHex(t.text ?? "") ?? (isDark(background) ? "#f4f3ee" : (DEFAULT_THEME.text as string));
  const accentIn = normalizeHex(t.accent ?? "") ?? (DEFAULT_THEME.accent as string);

  let text = textIn;
  if (contrastRatio(text, background) < 4.5) {
    text = ensureContrast(text, background, 4.5);
    if (text !== textIn) warnings.push("Text color was darkened/lightened to stay readable on the background.");
  }
  let accent = accentIn;
  if (contrastRatio(accent, background) < 2.2) {
    accent = ensureContrast(accent, background, 3);
    if (accent !== accentIn) warnings.push("Accent color was adjusted so buttons stand out from the background.");
  }
  const fonts = resolveFontIds(t);
  return {
    background,
    text,
    accent,
    accentInk: readableOn(accent),
    buttonStyle: t.buttonStyle ?? "pill",
    radius: t.radius ?? "lg",
    heading: fonts.heading,
    body: fonts.body,
    logoUrl: t.logoUrl || undefined,
    logoPlacement: t.logoPlacement ?? "top-left",
    dark: isDark(background),
    warnings,
  };
}

/** CSS variables consumed by `.renderer-themed` rules in globals.css. */
export function themeCssVars(theme: ResolvedTheme): CSSProperties {
  const { background, text, accent } = theme;
  const vars: Record<string, string> = {
    "--f-bg": background,
    "--f-text": text,
    "--f-accent": accent,
    "--f-accent-ink": theme.accentInk,
    "--f-muted": alpha(text, 0.68),
    "--f-faint": alpha(text, 0.5),
    "--f-surface": theme.dark ? alpha(text, 0.06) : alpha(text, 0.035),
    "--f-surface-strong": theme.dark ? alpha(text, 0.12) : alpha(text, 0.07),
    "--f-border": alpha(text, theme.dark ? 0.22 : 0.16),
    "--f-border-strong": alpha(text, theme.dark ? 0.4 : 0.32),
    "--f-error": theme.dark ? "#ff8a80" : ensureContrast("#c4372f", background, 4.5),
    "--f-radius": `${RADIUS_PX[theme.radius]}px`,
    "--f-radius-button": BUTTON_RADIUS[theme.buttonStyle],
    "--f-font-heading": theme.heading.stack,
    "--f-font-body": theme.body.stack,
  };
  return vars as CSSProperties;
}

/** Stylesheet URL for the theme's web fonts (null when all are system fonts). */
export function themeFontsHref(theme: ResolvedTheme): string | null {
  return googleFontsHref([theme.heading, theme.body]);
}

/** A soft tint of the accent for illustration surfaces (cards, chips). */
export function accentTint(theme: ResolvedTheme, amount = 0.12): string {
  return mix(theme.background, theme.accent, amount);
}

/** Legacy helper kept for callers that only need the three core colors. */
export function themeColors(raw: unknown): { background: string; text: string; accent: string } {
  const t = resolveTheme(raw);
  return { background: t.background, text: t.text, accent: t.accent };
}

/**
 * Free plan publishes preset colours only (no logo, no brand kit). Returns a
 * human reason when the theme needs a paid plan, or null when it's fine.
 * Fonts, corner radius and button shape are free for everyone.
 */
export function themeRequiresPaidPlan(raw: unknown): string | null {
  const t = (raw ?? {}) as FormTheme;
  if (t.logoUrl) return "A logo on the form is part of custom branding.";
  if (t.brandKitId) return "This form uses a brand kit.";
  const bg = (t.background ?? DEFAULT_THEME.background ?? "").toLowerCase();
  const text = (t.text ?? DEFAULT_THEME.text ?? "").toLowerCase();
  const accent = (t.accent ?? DEFAULT_THEME.accent ?? "").toLowerCase();
  const matches = THEME_PRESETS.some(
    (p) =>
      p.theme.background.toLowerCase() === bg &&
      p.theme.text.toLowerCase() === text &&
      p.theme.accent.toLowerCase() === accent,
  );
  return matches ? null : "Custom colours are part of custom branding.";
}
