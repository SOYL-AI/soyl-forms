import { FONTS, FONT_IDS, getFont, matchFontName } from "@/lib/forms/fonts";
import { contrastRatio, ensureContrast, normalizeHex } from "@/lib/forms/color";
import { brandProfileSchema, type BrandProfile } from "@/lib/brand/types";
import { heuristicProfile, type BrandSignals } from "@/lib/brand/extract";
import { chatJson, extractJson, isAiConfigured } from "./client";

export function buildBrandPrompt(): string {
  const fontIds = FONTS.map((f) => `${f.id} (${f.category}: ${f.feel})`).join("; ");
  return [
    "You are a brand analyst preparing a design brief for a form builder. Reply with NOTHING but one JSON object.",
    'Shape: {"name":string,"colors":{"primary":hex,"secondary"?:hex,"background":hex,"text":hex,"palette":hex[]},"fonts":{"heading":fontId,"body":fontId,"detected":string[]},"voice":{"tone":string,"audience":string,"avoid":string[],"sample":string},"style":{"radius":"none"|"sm"|"md"|"lg"|"xl","buttonStyle":"pill"|"rounded"|"square"},"summary":string,"notes":string[]}.',
    "Colours: prefer evidence in this order — explicit hex codes from guideline documents, CSS variables named brand/primary/accent, theme-color, then frequent stylesheet colours, then logo colours. primary is the brand's signature colour (never white/black/grey unless the brand is truly monochrome, in which case pick the darkest neutral and say so in notes). background is light (#f5–#ff range) unless the evidence clearly shows a dark brand. text must read clearly on background. palette lists up to 6 supporting colours actually found.",
    "Fonts: choose ONLY from these ids — " + fontIds + ". Map detected fonts to the closest id (Helvetica/Arial/Roboto/Gotham/Montserrat → inter or dm-sans; Playfair/Didot → playfair; Georgia/Garamond → libre-baskerville or lora; monospace → jetbrains-mono). List the original names in detected.",
    "Voice: derive tone (2–4 adjectives), audience (one phrase), avoid (phrasings the brand wouldn't use), and a one-sentence sample in the brand's voice — based on the copy provided, not invented.",
    "Style: sharp corners for corporate/luxury/editorial brands, larger radius + pill buttons for friendly consumer brands.",
    "summary: 2–3 sentences a designer would need to make a form feel like this brand. notes: what was uncertain or missing (e.g. 'no fonts found in the PDF').",
    "Never invent facts about the company. No markdown, no commentary.",
  ].join("\n");
}

export function buildBrandEvidence(signals: BrandSignals, name: string, extra?: { logoColors?: string[]; userText?: string }): string {
  const colors = [...signals.colors]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 24)
    .map((c) => `${c.hex} (weight ${c.weight}, ${c.source})`);
  const parts = [
    `Brand name (as given by the user): ${name}`,
    signals.websiteTitle ? `Website title: ${signals.websiteTitle}` : "",
    signals.websiteDescription ? `Website description: ${signals.websiteDescription}` : "",
    colors.length ? `Colour evidence:\n${colors.join("\n")}` : "Colour evidence: none found.",
    extra?.logoColors?.length ? `Logo colours (dominant first): ${extra.logoColors.join(", ")}` : "",
    signals.fontNames.length ? `Font names found: ${signals.fontNames.join(", ")}` : "Font names found: none.",
    extra?.userText ? `Notes from the user:\n${extra.userText.slice(0, 2000)}` : "",
    ...signals.textSamples.slice(0, 4).map((t) => `--- ${t.source} ---\n${t.text.slice(0, 3500)}`),
    signals.notes.length ? `Extractor notes: ${signals.notes.join(" | ")}` : "",
  ];
  return parts.filter(Boolean).join("\n\n").slice(0, 24000);
}

/** Coerce a model's profile into the allow-lists and legibility rules. */
export function normalizeProfile(raw: unknown, fallback: BrandProfile): BrandProfile {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const colorsIn = (obj.colors ?? {}) as Record<string, unknown>;
  const fontsIn = (obj.fonts ?? {}) as Record<string, unknown>;
  const voiceIn = (obj.voice ?? {}) as Record<string, unknown>;
  const styleIn = (obj.style ?? {}) as Record<string, unknown>;

  // Model colours must be explicit hex ("#…"): bare words like "bad" would
  // otherwise parse as 3-digit hex.
  const hex = (v: unknown): string | null => (typeof v === "string" && v.trim().startsWith("#") ? normalizeHex(v.trim()) : null);
  const background = hex(colorsIn.background) ?? fallback.colors.background;
  const primary = hex(colorsIn.primary) ?? fallback.colors.primary;
  const textRaw = hex(colorsIn.text) ?? fallback.colors.text;
  const text = contrastRatio(textRaw, background) >= 4.5 ? textRaw : ensureContrast(textRaw, background, 7);
  const secondary = hex(colorsIn.secondary) ?? fallback.colors.secondary;
  const palette = (Array.isArray(colorsIn.palette) ? colorsIn.palette : fallback.colors.palette)
    .map((c) => hex(c))
    .filter((c): c is string => Boolean(c))
    .slice(0, 6);

  const detected = (Array.isArray(fontsIn.detected) ? fontsIn.detected : fallback.fonts.detected)
    .map((d) => String(d).slice(0, 80))
    .slice(0, 8);
  const pickFont = (id: unknown, want: "heading" | "body"): string => {
    if (typeof id === "string" && (FONT_IDS as readonly string[]).includes(id)) return id;
    for (const name of detected) {
      const m = matchFontName(name);
      if (m && (want === "body" ? m.category !== "display" : true)) return m.id;
    }
    return want === "heading" ? fallback.fonts.heading : fallback.fonts.body;
  };
  const heading = pickFont(fontsIn.heading, "heading");
  let body = pickFont(fontsIn.body, "body");
  if (getFont(body)?.category === "display") body = "inter";

  const str = (v: unknown, max: number, fb: string) => (typeof v === "string" ? v.slice(0, max) : fb);
  const list = (v: unknown, fb: string[]) =>
    Array.isArray(v) ? v.map((x) => String(x).slice(0, 80)).filter(Boolean).slice(0, 20) : fb;
  const radius = ["none", "sm", "md", "lg", "xl"].includes(String(styleIn.radius)) ? (String(styleIn.radius) as BrandProfile["style"]["radius"]) : fallback.style.radius;
  const buttonStyle = ["pill", "rounded", "square"].includes(String(styleIn.buttonStyle)) ? (String(styleIn.buttonStyle) as BrandProfile["style"]["buttonStyle"]) : fallback.style.buttonStyle;

  const candidate = {
    name: str(obj.name, 80, fallback.name) || fallback.name,
    colors: { primary, secondary, background, text, palette },
    fonts: { heading, body, detected },
    voice: {
      tone: str(voiceIn.tone, 300, fallback.voice.tone),
      audience: str(voiceIn.audience, 300, fallback.voice.audience),
      avoid: list(voiceIn.avoid, fallback.voice.avoid),
      sample: str(voiceIn.sample, 600, fallback.voice.sample),
    },
    style: { radius, buttonStyle },
    summary: str(obj.summary, 2000, fallback.summary),
    notes: list(obj.notes, fallback.notes).slice(0, 6).map((n) => n.slice(0, 200)),
  };
  const parsed = brandProfileSchema.safeParse(candidate);
  return parsed.success ? parsed.data : fallback;
}

/**
 * Full brand extraction: deterministic signals → model interpretation →
 * allow-listed profile. Falls back to the heuristic profile whenever the
 * model is unavailable or returns junk, so the flow never dead-ends.
 */
export async function extractBrandProfile(args: {
  signals: BrandSignals;
  name: string;
  logoColors?: string[];
  userText?: string;
}): Promise<{ profile: BrandProfile; usedAi: boolean }> {
  const heuristic = heuristicProfile(args.signals, args.name);
  if (args.logoColors?.length) {
    // Logo colours are strong evidence when documents/websites gave nothing.
    const vivid = args.logoColors.find((c) => {
      const h = normalizeHex(c);
      return h && !["#ffffff", "#000000"].includes(h);
    });
    if (args.signals.colors.length === 0 && vivid) heuristic.colors.primary = normalizeHex(vivid) as string;
  }
  const fallback = brandProfileSchema.parse(heuristic);
  if (!isAiConfigured()) return { profile: fallback, usedAi: false };
  try {
    const content = await chatJson({
      system: buildBrandPrompt(),
      user: buildBrandEvidence(args.signals, args.name, { logoColors: args.logoColors, userText: args.userText }),
      maxTokens: 2500,
      temperature: 0.3,
    });
    const profile = normalizeProfile(extractJson(content), fallback);
    return { profile, usedAi: true };
  } catch {
    return { profile: { ...fallback, notes: [...fallback.notes, "The AI step failed; this profile came from the extractor only."] }, usedAi: false };
  }
}
