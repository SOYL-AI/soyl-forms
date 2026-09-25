import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  derivePalette,
  ensureContrast,
  extractHexColors,
  isNeutral,
  luminance,
  mix,
  normalizeHex,
  readableOn,
} from "@/lib/forms/color";

describe("color utilities", () => {
  it("normalizes 3- and 6-digit hex", () => {
    expect(normalizeHex("#FFF")).toBe("#ffffff");
    expect(normalizeHex("0E7C5B")).toBe("#0e7c5b");
    expect(normalizeHex("nope")).toBeNull();
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
    expect(luminance("#ffffff")).toBeCloseTo(1, 3);
  });

  it("picks a readable foreground and repairs low contrast", () => {
    expect(readableOn("#f2b418")).toBe("#000000");
    expect(readableOn("#101012")).toBe("#ffffff");
    const fixed = ensureContrast("#f2b418", "#ffffff", 4.5);
    expect(contrastRatio(fixed, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    // Already-fine colours are untouched.
    expect(ensureContrast("#101012", "#ffffff")).toBe("#101012");
  });

  it("mixes and classifies neutrals", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(isNeutral("#888888")).toBe(true);
    expect(isNeutral("#0e7c5b")).toBe(false);
  });

  it("extracts hex colours from text once each, in order", () => {
    expect(extractHexColors("Primary #0E7C5B, accent #f2b418, again #0e7c5b, short #abc")).toEqual([
      "#0e7c5b",
      "#f2b418",
      "#aabbcc",
    ]);
  });

  it("derives a legible palette from candidates", () => {
    const p = derivePalette(["#ffffff", "#111111", "#0e7c5b", "#f2b418", "#eeeeee"]);
    expect(["#0e7c5b", "#f2b418"]).toContain(p.accent);
    expect(contrastRatio(p.text, p.background)).toBeGreaterThanOrEqual(4.5);
  });
});
