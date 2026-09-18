import type { FormTheme } from "@/types/forms";

export interface ThemePreset {
  id: string;
  name: string;
  theme: Required<Pick<FormTheme, "background" | "text" | "accent">> &
    Pick<FormTheme, "font" | "buttonStyle">;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "forest",
    name: "Forest",
    theme: { background: "#FFFFFF", text: "#1C1917", accent: "#0E7C5B", font: "serif", buttonStyle: "pill" },
  },
  {
    id: "ocean",
    name: "Ocean",
    theme: { background: "#F7FAFC", text: "#1A2B3C", accent: "#1565C0", font: "sans", buttonStyle: "rounded" },
  },
  {
    id: "terracotta",
    name: "Terracotta",
    theme: { background: "#FDF8F3", text: "#3B2A20", accent: "#C05621", font: "serif", buttonStyle: "pill" },
  },
  {
    id: "slate",
    name: "Slate",
    theme: { background: "#F8FAFC", text: "#0F172A", accent: "#334155", font: "sans", buttonStyle: "rounded" },
  },
  {
    id: "rose",
    name: "Rose",
    theme: { background: "#FDF6F7", text: "#3B1F2B", accent: "#BE123C", font: "serif", buttonStyle: "pill" },
  },
  {
    id: "midnight",
    name: "Midnight",
    theme: { background: "#101418", text: "#F1F5F9", accent: "#38BDF8", font: "sans", buttonStyle: "pill" },
  },
];

export const DEFAULT_THEME: FormTheme = {
  background: "#FFFFFF",
  text: "#1C1917",
  accent: "#0E7C5B",
  font: "serif",
  buttonStyle: "pill",
};

export function resolveTheme(raw: unknown): Required<Omit<FormTheme, "logoUrl">> & Pick<FormTheme, "logoUrl"> {
  const t = (raw ?? {}) as FormTheme;
  return {
    background: t.background ?? DEFAULT_THEME.background as string,
    text: t.text ?? DEFAULT_THEME.text as string,
    accent: t.accent ?? DEFAULT_THEME.accent as string,
    font: t.font ?? "serif",
    buttonStyle: t.buttonStyle ?? "pill",
    logoUrl: t.logoUrl,
  };
}
