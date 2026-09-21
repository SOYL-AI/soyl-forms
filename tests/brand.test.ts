import { describe, expect, it } from "vitest";
import { addColors, addFonts, emptySignals, findFontNames, heuristicProfile, signalsFromText } from "@/lib/brand/extract";
import { buildBrandEvidence, buildBrandPrompt, normalizeProfile } from "@/lib/ai/brand";
import { brandKitInputSchema, brandKitToTheme, brandProfileSchema, rowToBrandKit } from "@/lib/brand/types";
import { formThemeSchema } from "@/lib/forms/schema";
import { contrastRatio } from "@/lib/forms/color";

describe("brand signal extraction", () => {
  it("finds font names in prose and CSS", () => {
    const names = findFontNames("Headlines are set in Playfair Display; body copy uses Helvetica Neue. font-family: 'Inter', sans-serif;");
    expect(names).toContain("Playfair Display");
    expect(names).toContain("Helvetica Neue");
    expect(names).toContain("Inter");
  });

  it("reads colours and fonts out of pasted guidelines", () => {
    const s = emptySignals();
    signalsFromText("Brand green #0E7C5B. Secondary marigold #F2B418. Typeface: Fraunces for headings, Work Sans for body.", "notes", s);
    expect(s.colors.map((c) => c.hex)).toEqual(["#0e7c5b", "#f2b418"]);
    expect(s.fontMatches.map((f) => f.id)).toContain("fraunces");
    expect(s.fontMatches.map((f) => f.id)).toContain("work-sans");
    const profile = heuristicProfile(s, "Kaveri");
    expect(profile.colors.primary).toBe("#0e7c5b");
    expect(profile.fonts.heading).toBe("fraunces");
    expect(brandProfileSchema.safeParse(profile).success).toBe(true);
  });

  it("weights repeated colours and prefers them", () => {
    const s = emptySignals();
    addColors(s, ["#1565c0"], "css vars", 5);
    addColors(s, ["#1565c0", "#c05621"], "stylesheet", 1);
    addFonts(s, ["Gotham"]);
    const p = heuristicProfile(s, "X");
    expect(p.colors.primary).toBe("#1565c0");
    expect(p.fonts.body).toBe("inter");
    expect(buildBrandEvidence(s, "X")).toContain("#1565c0 (weight 6");
    expect(buildBrandPrompt()).toContain("fontId");
  });
});

describe("brand profile normalisation", () => {
  const fallback = brandProfileSchema.parse(heuristicProfile(emptySignals(), "Fallback"));

  it("coerces model output onto allow-lists and fixes contrast", () => {
    const p = normalizeProfile(
      {
        name: "Nimbus",
        colors: { primary: "#5B8CFF", background: "#0f1424", text: "#0f1424", palette: ["#5b8cff", "bad"] },
        fonts: { heading: "Gotham Bold", body: "manrope", detected: ["Gotham"] },
        voice: { tone: "precise", audience: "finance teams", avoid: ["synergy"], sample: "Move money without the drama." },
        style: { radius: "weird", buttonStyle: "rounded" },
        summary: "A fintech.",
        notes: [],
      },
      fallback,
    );
    expect(p.fonts.heading).toBe("inter"); // Gotham → inter via detected names
    expect(p.fonts.body).toBe("manrope");
    expect(p.style.radius).toBe(fallback.style.radius);
    expect(contrastRatio(p.colors.text, p.colors.background)).toBeGreaterThanOrEqual(4.5);
    expect(p.colors.palette).toEqual(["#5b8cff"]);
  });

  it("falls back wholesale on garbage", () => {
    expect(normalizeProfile("nope", fallback)).toEqual(fallback);
  });

  it("turns a kit into a valid renderer theme", () => {
    const input = brandKitInputSchema.parse({
      name: "Kit",
      colors: { primary: "#0e7c5b", background: "#ffffff", text: "#1c1917", palette: [] },
      fonts: { heading: "fraunces", body: "inter", detected: [] },
      voice: {},
      style: {},
      logoUrl: "/api/public/assets/00000000-0000-0000-0000-000000000000",
    });
    const kit = rowToBrandKit({
      id: "k1",
      workspace_id: "w1",
      name: input.name,
      is_default: true,
      logo_url: input.logoUrl ?? null,
      logo_file_id: null,
      colors: input.colors,
      fonts: input.fonts,
      voice: input.voice,
      style: input.style,
      summary: "",
      sources: [],
      created_at: "2026-09-20T00:00:00Z",
      updated_at: "2026-09-20T00:00:00Z",
    });
    const theme = brandKitToTheme(kit);
    expect(formThemeSchema.safeParse(theme).success).toBe(true);
    expect(theme.brandKitId).toBe("k1");
    expect(theme.accent).toBe("#0e7c5b");
  });
});
