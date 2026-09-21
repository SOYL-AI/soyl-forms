import { extractHexColors, derivePalette, normalizeHex } from "@/lib/forms/color";
import { FONTS, matchFontName, type FontDef } from "@/lib/forms/fonts";

/**
 * Deterministic brand-signal extraction. Everything here runs before the
 * model sees anything, so the AI only has to interpret real evidence
 * (hex codes from a PDF, font-family rules from a stylesheet) rather than
 * guess. Also the fallback when no AI provider is configured.
 */

export interface BrandSignals {
  name?: string;
  websiteTitle?: string;
  websiteDescription?: string;
  /** Hex colours with rough frequency weights (higher = seen more often). */
  colors: Array<{ hex: string; weight: number; source: string }>;
  /** Raw font names as written in sources. */
  fontNames: string[];
  /** Curated font matches for the raw names. */
  fontMatches: FontDef[];
  logoCandidates: string[];
  /** Trimmed text from guidelines / site copy for tone analysis. */
  textSamples: Array<{ source: string; text: string }>;
  notes: string[];
}

export function emptySignals(): BrandSignals {
  return { colors: [], fontNames: [], fontMatches: [], logoCandidates: [], textSamples: [], notes: [] };
}

/** Common brand typefaces worth spotting in prose (matched case-insensitively). */
const KNOWN_FONT_NAMES = [
  ...FONTS.map((f) => f.label),
  "Helvetica", "Helvetica Neue", "Arial", "Roboto", "Open Sans", "Lato", "Montserrat", "Source Sans",
  "Proxima Nova", "Gotham", "Avenir", "Futura", "Circular", "Graphik", "Söhne", "Sohne", "Gilroy",
  "Raleway", "Rubik", "Karla", "Mulish", "Quicksand", "Cabin", "Barlow", "Oswald", "Bebas Neue",
  "Georgia", "Garamond", "Caslon", "Baskerville", "Minion", "Tiempos", "Didot", "Bodoni", "Canela",
  "Freight", "Recoleta", "Cooper", "GT Super", "Ivar", "Times New Roman", "Courier", "Consolas",
  "Noto Sans", "Noto Serif", "Hind", "Mukta", "Tiro Devanagari",
];

export function findFontNames(text: string): string[] {
  const found = new Set<string>();
  // Explicit CSS-ish declarations first.
  for (const m of text.matchAll(/font-family\s*:\s*([^;}{"\n]+)/gi)) {
    const first = (m[1] ?? "").split(",")[0]?.replace(/["']/g, "").trim();
    if (first && first.length < 40) found.add(first);
  }
  const lower = text.toLowerCase();
  for (const name of KNOWN_FONT_NAMES) {
    const re = new RegExp(`(?<![a-z])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`);
    if (re.test(lower)) found.add(name);
  }
  return [...found].slice(0, 10);
}

export function addColors(signals: BrandSignals, hexes: string[], source: string, weight = 1): void {
  for (const raw of hexes) {
    const hex = normalizeHex(raw);
    if (!hex) continue;
    const existing = signals.colors.find((c) => c.hex === hex);
    if (existing) existing.weight += weight;
    else signals.colors.push({ hex, weight, source });
  }
}

export function addFonts(signals: BrandSignals, names: string[]): void {
  for (const n of names) {
    if (!signals.fontNames.includes(n)) signals.fontNames.push(n);
    const match = matchFontName(n);
    if (match && !signals.fontMatches.some((f) => f.id === match.id)) signals.fontMatches.push(match);
  }
}

/** Text + colour + font signals from a brand guideline PDF (via unpdf). */
export async function signalsFromPdf(
  bytes: Uint8Array,
  label: string,
  signals: BrandSignals,
): Promise<void> {
  try {
    const { extractText } = await import("unpdf");
    const { text, totalPages } = await extractText(bytes, { mergePages: true });
    const body = (Array.isArray(text) ? text.join("\n") : text).replace(/\s+/g, " ").trim();
    if (!body) {
      signals.notes.push(`${label}: no selectable text (scanned PDF?) — colours were not read.`);
      return;
    }
    addColors(signals, extractHexColors(body), label, 3);
    addColors(signals, keywordColors(body), `${label} (named primary)`, 4);
    addFonts(signals, findFontNames(body));
    // Also catch "R 242 G 180 B 24" / "242, 180, 24" style specs.
    for (const m of body.matchAll(/R\s*:?\s*(\d{1,3})\s*,?\s*G\s*:?\s*(\d{1,3})\s*,?\s*B\s*:?\s*(\d{1,3})/gi)) {
      const hex = `#${[m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0")).join("")}`;
      addColors(signals, [hex], label, 3);
    }
    signals.textSamples.push({ source: `${label} (${totalPages} pages)`, text: body.slice(0, 6000) });
  } catch (e) {
    signals.notes.push(`${label}: couldn't be parsed (${e instanceof Error ? e.message.slice(0, 80) : "unknown error"}).`);
  }
}

/** Plain text / markdown guidelines pasted or uploaded. */
/** Colours introduced as "primary", "brand" or "main" deserve extra weight. */
export function keywordColors(text: string): string[] {
  const out: string[] = [];
  const re = /\b(primary|brand|main|signature|hero)\b[^#\n]{0,40}?(#[0-9a-fA-F]{3,6})\b/gi;
  for (const m of text.matchAll(re)) {
    const hex = normalizeHex(m[2] ?? "");
    if (hex && !out.includes(hex)) out.push(hex);
  }
  return out;
}

/** Plain text / markdown guidelines pasted or uploaded. */
export function signalsFromText(text: string, label: string, signals: BrandSignals): void {
  const body = text.replace(/\s+/g, " ").trim();
  if (!body) return;
  addColors(signals, extractHexColors(body), label, 3);
  addColors(signals, keywordColors(body), `${label} (named primary)`, 4);
  addFonts(signals, findFontNames(body));
  signals.textSamples.push({ source: label, text: body.slice(0, 6000) });
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;

function isFetchableUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (PRIVATE_HOST.test(u.hostname)) return null;
    // 172.16.0.0/12
    const m = /^172\.(\d+)\./.exec(u.hostname);
    if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return null;
    return u;
  } catch {
    return null;
  }
}

async function fetchText(url: string, maxBytes: number, accept: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { accept, "user-agent": "SoylFormsBrandBot/1.0 (+https://forms.soylai.com)" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const reader = res.body?.getReader();
    if (!reader) return await res.text();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      total += value.byteLength;
      chunks.push(value);
      if (total >= maxBytes) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(merged);
  } catch {
    return null;
  }
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag);
  return m?.[1];
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Colours, fonts, logo candidates and copy from a public website. SSRF-safe
 * (https, no private hosts, byte caps, short timeouts). Best-effort: any
 * failure becomes a note rather than an error.
 */
export async function signalsFromWebsite(rawUrl: string, signals: BrandSignals): Promise<void> {
  const url = isFetchableUrl(rawUrl);
  if (!url) {
    signals.notes.push("Website URL was skipped (must be a public https address).");
    return;
  }
  const html = await fetchText(url.toString(), 1_500_000, "text/html,*/*;q=0.8");
  if (!html) {
    signals.notes.push(`Couldn't load ${url.hostname} — it may block bots. Colours/fonts came from other sources.`);
    return;
  }
  const label = url.hostname;
  const title = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html)?.[1]?.trim();
  if (title) signals.websiteTitle = title;
  for (const tag of html.match(/<meta[^>]+>/gi) ?? []) {
    const name = (attr(tag, "name") ?? attr(tag, "property") ?? "").toLowerCase();
    const content = attr(tag, "content");
    if (!content) continue;
    if (name === "description" || name === "og:description") signals.websiteDescription ??= content.slice(0, 300);
    if (name === "theme-color") addColors(signals, extractHexColors(content), `${label} theme-color`, 6);
    if (name === "og:image") signals.logoCandidates.push(new URL(content, url).toString());
    if (name === "og:site_name") signals.name ??= content.slice(0, 80);
  }
  for (const tag of html.match(/<link[^>]+>/gi) ?? []) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    const href = attr(tag, "href");
    if (!href) continue;
    if (rel.includes("icon")) signals.logoCandidates.push(new URL(href, url).toString());
    if (href.includes("fonts.googleapis.com")) {
      for (const m of href.matchAll(/family=([^&:]+)/g)) {
        addFonts(signals, [decodeURIComponent((m[1] ?? "").replace(/\+/g, " "))]);
      }
    }
  }
  // Inline styles + <style> blocks.
  const inlineCss = [...(html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) ?? []), ...(html.match(/style\s*=\s*"[^"]*"/gi) ?? [])].join("\n");
  addColors(signals, extractHexColors(inlineCss), `${label} inline CSS`, 1);
  addFonts(signals, findFontNames(inlineCss));
  // A few linked stylesheets (capped).
  const sheets = [...(html.match(/<link[^>]+rel\s*=\s*["']stylesheet["'][^>]*>/gi) ?? [])]
    .map((tag) => attr(tag, "href"))
    .filter((h): h is string => Boolean(h))
    .slice(0, 3);
  for (const href of sheets) {
    const sheetUrl = isFetchableUrl(new URL(href, url).toString());
    if (!sheetUrl) continue;
    const css = await fetchText(sheetUrl.toString(), 300_000, "text/css,*/*;q=0.5");
    if (!css) continue;
    // Weight CSS variables and button/brand-ish selectors higher.
    const vars = [...css.matchAll(/--[a-z0-9-]*(brand|primary|accent|main)[a-z0-9-]*\s*:\s*(#[0-9a-f]{3,6})/gi)].map((m) => m[2] ?? "");
    addColors(signals, vars, `${label} CSS variables`, 5);
    addColors(signals, extractHexColors(css).slice(0, 60), `${label} stylesheet`, 1);
    addFonts(signals, findFontNames(css));
  }
  const text = stripTags(html);
  if (text) signals.textSamples.push({ source: `${label} copy`, text: text.slice(0, 4000) });
  // Ignore pure white/black noise from generic CSS resets.
  signals.colors = signals.colors.filter((c) => !["#ffffff", "#000000", "#fff", "#000"].includes(c.hex) || c.weight > 8);
}

/** Heuristic profile when no model is available (or as a prior for the model). */
export function heuristicProfile(signals: BrandSignals, fallbackName: string) {
  const weights = new Map(signals.colors.map((c) => [c.hex, c.weight]));
  const palette = derivePalette(signals.colors.map((c) => c.hex), weights);
  const heading = signals.fontMatches.find((f) => f.category === "serif" || f.category === "display") ?? signals.fontMatches[0];
  const body = signals.fontMatches.find((f) => f.category === "sans") ?? signals.fontMatches[1] ?? signals.fontMatches[0];
  return {
    name: signals.name ?? signals.websiteTitle?.split(/[|–—-]/)[0]?.trim() ?? fallbackName,
    colors: {
      primary: palette.accent,
      secondary: palette.supporting[0],
      background: palette.background,
      text: palette.text,
      palette: [palette.accent, ...palette.supporting].slice(0, 6),
    },
    fonts: {
      heading: heading?.id ?? "inter",
      body: body?.id ?? "inter",
      detected: signals.fontNames.slice(0, 8),
    },
    voice: {
      tone: "",
      audience: "",
      avoid: [],
      sample: signals.websiteDescription ?? "",
    },
    style: { radius: "lg" as const, buttonStyle: "pill" as const },
    summary: signals.websiteDescription ?? "",
    notes: [
      ...signals.notes,
      ...(signals.colors.length === 0 ? ["No colours were found in the sources — set them manually."] : []),
      ...(signals.fontMatches.length === 0 ? ["No fonts were detected — defaults chosen."] : []),
    ],
  };
}
