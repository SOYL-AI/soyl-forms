/**
 * Small, dependency-free color utilities used by the theme engine and the
 * brand extractor. Everything works on 6-digit hex.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1] as string;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: RGB): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function normalizeHex(hex: string): string | null {
  const rgb = parseHex(hex);
  return rgb ? toHex(rgb) : null;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}

/** WCAG contrast ratio between two hex colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function isDark(hex: string): boolean {
  return luminance(hex) < 0.35;
}

/** Black or white, whichever reads better on `bg`. */
export function readableOn(bg: string): string {
  return contrastRatio(bg, "#000000") >= contrastRatio(bg, "#ffffff") ? "#000000" : "#ffffff";
}

/** Linear mix in sRGB: t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  return toHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

/** `rgba()` string from hex + alpha, for translucent surfaces. */
export function alpha(hex: string, a: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.max(0, Math.min(1, a))})`;
}

export function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const hue = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return { r: f(hue + 1 / 3) * 255, g: f(hue) * 255, b: f(hue - 1 / 3) * 255 };
}

export function saturation(hex: string): number {
  const rgb = parseHex(hex);
  return rgb ? rgbToHsl(rgb).s : 0;
}

/**
 * Nudge `fg` lighter/darker (keeping its hue) until it reaches `min`
 * contrast against `bg`. Used to keep AI/brand palettes legible without
 * discarding the brand color entirely.
 */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  const rgb = parseHex(fg);
  if (!rgb) return fg;
  if (contrastRatio(fg, bg) >= min) return toHex(rgb);
  const { h, s, l } = rgbToHsl(rgb);
  const goDarker = luminance(bg) > 0.5;
  let best = toHex(rgb);
  let bestRatio = contrastRatio(best, bg);
  for (let i = 1; i <= 20; i++) {
    const nl = goDarker ? l - (l / 20) * i : l + ((1 - l) / 20) * i;
    const candidate = toHex(hslToRgb(h, s, Math.max(0, Math.min(1, nl))));
    const ratio = contrastRatio(candidate, bg);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
    if (ratio >= min) return candidate;
  }
  return best;
}

/** True when the color is close to a neutral gray/white/black. */
export function isNeutral(hex: string, threshold = 0.12): boolean {
  return saturation(hex) < threshold;
}

/** Perceptual-ish distance (0–~441) between two hex colors. */
export function distance(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return Infinity;
  return Math.sqrt((ca.r - cb.r) ** 2 + (ca.g - cb.g) ** 2 + (ca.b - cb.b) ** 2);
}

/** Every 6-digit hex color mentioned in a blob of text, de-duplicated, in order. */
export function extractHexColors(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const hex = normalizeHex(`#${m[1]}`);
    if (hex && !seen.has(hex)) {
      seen.add(hex);
      out.push(hex);
    }
  }
  return out;
}

/**
 * Pick a usable palette from a bag of candidate colors: the most saturated
 * non-neutral becomes the accent; background and text are chosen for
 * contrast. Frequencies (if given) break ties.
 */
export function derivePalette(
  candidates: string[],
  weights?: Map<string, number>,
): { accent: string; background: string; text: string; supporting: string[] } {
  const colors = candidates.map(normalizeHex).filter((c): c is string => Boolean(c));
  const maxWeight = Math.max(1, ...(weights ? [...weights.values()] : [1]));
  // Evidence weight first, then order of mention (guidelines list the primary
  // colour first), then saturation as the tie-breaker.
  const score = (c: string) => {
    const order = colors.indexOf(c);
    const orderBonus = order === -1 ? 0 : 1 - order / Math.max(1, colors.length);
    return ((weights?.get(c) ?? 0) / maxWeight) * 2 + orderBonus + saturation(c);
  };
  const vivid = colors.filter((c) => !isNeutral(c) && luminance(c) > 0.02 && luminance(c) < 0.9);
  vivid.sort((a, b) => score(b) - score(a));
  const accent = vivid[0] ?? colors.find((c) => !isNeutral(c)) ?? "#0e7c5b";

  const lights = colors.filter((c) => luminance(c) > 0.85);
  const darks = colors.filter((c) => luminance(c) < 0.12);
  const background = lights[0] ?? "#ffffff";
  const textCandidate = darks[0] ?? "#111111";
  const text = ensureContrast(textCandidate, background, 7);
  const supporting = vivid.filter((c) => c !== accent && distance(c, accent) > 60).slice(0, 4);
  return { accent, background, text, supporting };
}
