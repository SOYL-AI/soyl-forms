/** Resolve internal navigation without allowing URL-parser normalization to escape our origin. */
export function safeAuthNext(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || raw.length > 2048 || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // Reject both literal and encoded separators/control characters before URL parsing.
  if (/[\\\u0000-\u0020\u007f]/.test(raw) || /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f|25)/i.test(raw)) return fallback;
  const base = new URL("https://forms.invalid");
  try {
    const result = new URL(raw, base);
    return result.origin === base.origin ? `${result.pathname}${result.search}${result.hash}` : fallback;
  } catch {
    return fallback;
  }
}
