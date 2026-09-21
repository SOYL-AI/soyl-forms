import { describe, expect, it } from "vitest";
import { THEME_PRESETS, resolveTheme, themeCssVars, themeFontsHref, themeRequiresPaidPlan } from "@/lib/forms/themes";
import { contrastRatio } from "@/lib/forms/color";
import { formThemeSchema } from "@/lib/forms/schema";
import { googleFontsHref, matchFontName, resolveFontIds, FONTS } from "@/lib/forms/fonts";

describe("theme engine", () => {
  it("every preset is valid and legible", () => {
    for (const p of THEME_PRESETS) {
      expect(formThemeSchema.safeParse(p.theme).success).toBe(true);
      const r = resolveTheme(p.theme);
      expect(r.warnings).toEqual([]);
      expect(contrastRatio(r.text, r.background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("repairs unreadable pasted palettes and reports it", () => {
    const r = resolveTheme({ background: "#ffffff", text: "#eeeeee", accent: "#fafafa" });
    expect(contrastRatio(r.text, r.background)).toBeGreaterThanOrEqual(4.5);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("infers light text on a dark background when text is missing", () => {
    const r = resolveTheme({ background: "#101418", accent: "#38bdf8" });
    expect(r.dark).toBe(true);
    expect(contrastRatio(r.text, r.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("emits CSS variables and font links", () => {
    const r = resolveTheme(THEME_PRESETS[0]?.theme);
    const vars = themeCssVars(r) as Record<string, string>;
    expect(vars["--f-bg"]).toBe(r.background);
    expect(vars["--f-accent-ink"]).toMatch(/^#(000000|ffffff)$/);
    expect(themeFontsHref(r)).toContain("fonts.googleapis.com");
    expect(googleFontsHref([FONTS.find((f) => f.id === "system-sans")!])).toBeNull();
  });

  it("honours the legacy serif/sans switch", () => {
    expect(resolveFontIds({ font: "sans" }).heading.id).toBe("system-sans");
    expect(resolveFontIds({ font: "serif" }).heading.id).toBe("system-serif");
    expect(resolveFontIds({ headingFont: "playfair", font: "sans" }).heading.id).toBe("playfair");
  });

  it("maps brand font names onto the allow-list", () => {
    expect(matchFontName("Helvetica Neue")?.id).toBe("inter");
    expect(matchFontName("Playfair Display")?.id).toBe("playfair");
    expect(matchFontName("Bodoni Moda")?.id).toBe("playfair");
    expect(matchFontName("Fira Code Mono")?.id).toBe("jetbrains-mono");
    expect(matchFontName("")).toBeUndefined();
  });

  it("gates custom branding behind paid plans", () => {
    expect(themeRequiresPaidPlan(THEME_PRESETS[1]?.theme)).toBeNull();
    expect(themeRequiresPaidPlan({ ...THEME_PRESETS[1]?.theme, accent: "#123456" })).toMatch(/custom colours/i);
    expect(themeRequiresPaidPlan({ ...THEME_PRESETS[1]?.theme, logoUrl: "https://x.example/logo.png" })).toMatch(/logo/i);
    expect(themeRequiresPaidPlan({})).toBeNull();
  });
});
