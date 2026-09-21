import { z } from "zod";
import type { ButtonStyle, FormTheme, ThemeRadius } from "@/types/forms";
import { FONT_IDS } from "@/lib/forms/fonts";

/**
 * A brand kit is everything the AI (and the design panel) needs to make a
 * form feel like it belongs to a company: palette, type, voice, logo.
 * Stored per workspace; forms remember which kit they came from.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color.");

export const brandColorsSchema = z.object({
  primary: hex,
  secondary: hex.optional(),
  background: hex,
  text: hex,
  /** Extra swatches found in the source material. */
  palette: z.array(hex).max(12).default([]),
});

export const brandFontsSchema = z.object({
  heading: z.enum(FONT_IDS),
  body: z.enum(FONT_IDS),
  /** Original font names from the guidelines, for the creator's reference. */
  detected: z.array(z.string().max(80)).max(8).default([]),
});

export const brandVoiceSchema = z.object({
  tone: z.string().max(300).default(""),
  audience: z.string().max(300).default(""),
  /** Words or phrasings the brand avoids. */
  avoid: z.array(z.string().max(80)).max(20).default([]),
  /** Short sample of on-brand copy for the model to imitate. */
  sample: z.string().max(600).default(""),
});

export const brandStyleSchema = z.object({
  radius: z.enum(["none", "sm", "md", "lg", "xl"]).default("lg"),
  buttonStyle: z.enum(["rounded", "pill", "square"]).default("pill"),
});

export const brandSourceSchema = z.object({
  type: z.enum(["logo", "pdf", "url", "text", "image"]),
  label: z.string().max(200),
  fileId: z.string().max(64).optional(),
  url: z.string().max(2000).optional(),
});

export const brandKitInputSchema = z.object({
  name: z.string().min(1).max(80),
  logoUrl: z.string().max(2000).optional().nullable(),
  logoFileId: z.string().max(64).optional().nullable(),
  colors: brandColorsSchema,
  fonts: brandFontsSchema,
  voice: brandVoiceSchema,
  style: brandStyleSchema,
  summary: z.string().max(2000).default(""),
  sources: z.array(brandSourceSchema).max(20).default([]),
  isDefault: z.boolean().optional(),
});

export type BrandKitInput = z.infer<typeof brandKitInputSchema>;
export type BrandColors = z.infer<typeof brandColorsSchema>;
export type BrandFonts = z.infer<typeof brandFontsSchema>;
export type BrandVoice = z.infer<typeof brandVoiceSchema>;
export type BrandStyle = z.infer<typeof brandStyleSchema>;
export type BrandSource = z.infer<typeof brandSourceSchema>;

export interface BrandKit extends BrandKitInput {
  id: string;
  workspaceId: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Compact shape shipped to the builder's Design panel. */
export interface BrandKitSummary {
  id: string;
  name: string;
  isDefault: boolean;
  logoUrl: string | null;
  colors: BrandColors;
  fonts: Pick<BrandFonts, "heading" | "body">;
  style: BrandStyle;
}

/** What the AI extractor returns before the creator reviews it. */
export const brandProfileSchema = z.object({
  name: z.string().min(1).max(80),
  colors: brandColorsSchema,
  fonts: brandFontsSchema,
  voice: brandVoiceSchema,
  style: brandStyleSchema,
  summary: z.string().max(2000),
  /** Model's own notes about uncertainty ("no fonts found in PDF"). */
  notes: z.array(z.string().max(200)).max(6).default([]),
});
export type BrandProfile = z.infer<typeof brandProfileSchema>;

/** Turn a kit (or profile) into a form theme the renderer understands. */
export function brandKitToTheme(
  kit: Pick<BrandKitSummary, "colors" | "fonts" | "style"> & { id?: string; logoUrl?: string | null },
): FormTheme {
  return {
    background: kit.colors.background,
    text: kit.colors.text,
    accent: kit.colors.primary,
    headingFont: kit.fonts.heading,
    bodyFont: kit.fonts.body,
    radius: kit.style.radius as ThemeRadius,
    buttonStyle: kit.style.buttonStyle as ButtonStyle,
    logoUrl: kit.logoUrl ?? undefined,
    logoPlacement: "top-left",
    ...(kit.id ? { brandKitId: kit.id } : {}),
  };
}

export function toBrandKitSummary(kit: BrandKit): BrandKitSummary {
  return {
    id: kit.id,
    name: kit.name,
    isDefault: kit.isDefault,
    logoUrl: kit.logoUrl ?? null,
    colors: kit.colors,
    fonts: { heading: kit.fonts.heading, body: kit.fonts.body },
    style: kit.style,
  };
}

/** Row shape as stored in Postgres (jsonb columns). */
export interface BrandKitRow {
  id: string;
  workspace_id: string;
  name: string;
  is_default: boolean;
  logo_url: string | null;
  logo_file_id: string | null;
  colors: unknown;
  fonts: unknown;
  voice: unknown;
  style: unknown;
  summary: string;
  sources: unknown;
  created_at: string;
  updated_at: string;
}

export function rowToBrandKit(row: BrandKitRow): BrandKit {
  const colors = brandColorsSchema.safeParse(row.colors);
  const fonts = brandFontsSchema.safeParse(row.fonts);
  const voice = brandVoiceSchema.safeParse(row.voice);
  const style = brandStyleSchema.safeParse(row.style);
  const sources = z.array(brandSourceSchema).safeParse(row.sources);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    isDefault: row.is_default,
    logoUrl: row.logo_url,
    logoFileId: row.logo_file_id,
    colors: colors.success
      ? colors.data
      : { primary: "#0e7c5b", background: "#ffffff", text: "#1c1917", palette: [] },
    fonts: fonts.success ? fonts.data : { heading: "fraunces", body: "inter", detected: [] },
    voice: voice.success ? voice.data : { tone: "", audience: "", avoid: [], sample: "" },
    style: style.success ? style.data : { radius: "lg", buttonStyle: "pill" },
    summary: row.summary ?? "",
    sources: sources.success ? sources.data : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
