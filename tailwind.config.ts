import type { Config } from "tailwindcss";

/**
 * Theme colors are CSS variables (hex or rgba, see globals.css) so they can
 * flip for dark mode and be re-pointed by form themes. Tailwind can't apply
 * opacity modifiers (`bg-ink/5`, `border-ink/[0.07]`) to a bare `var()` and
 * silently emits nothing, so modifiers are resolved with color-mix() instead.
 * Solid classes still compile to a plain `var(--x)`.
 */
function token(name: string): string {
  const color = ({ opacityValue }: { opacityValue?: string }) =>
    opacityValue === undefined
      ? `var(--${name})`
      : `color-mix(in srgb, var(--${name}) calc(${opacityValue} * 100%), transparent)`;
  // Tailwind supports color functions at runtime; its Config types only model strings.
  return color as unknown as string;
}

const config: Config = {
  darkMode: "class",
  // Legacy `*-opacity-*` utilities are unused; disabling them keeps solid
  // color classes as a plain var() instead of routing them through color-mix().
  corePlugins: {
    textOpacity: false,
    backgroundOpacity: false,
    borderOpacity: false,
    divideOpacity: false,
    placeholderOpacity: false,
    ringOpacity: false,
  },
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        paper: {
          DEFAULT: token("paper"),
          deep: token("paper-deep"),
        },
        ink: {
          DEFAULT: token("ink"),
          soft: token("ink-soft"),
          faint: token("ink-faint"),
        },
        line: {
          DEFAULT: token("line"),
          strong: token("line-strong"),
        },
        accent: {
          DEFAULT: token("accent"),
          ink: token("accent-ink"),
          soft: token("accent-soft"),
        },
        positive: {
          DEFAULT: token("positive"),
          soft: token("positive-soft"),
        },
        danger: {
          DEFAULT: token("danger"),
          soft: token("danger-soft"),
        },
        warn: {
          DEFAULT: token("warn"),
          soft: token("warn-soft"),
        },
        info: {
          DEFAULT: token("info"),
          soft: token("info-soft"),
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        xl2: "1.25rem",
        xl3: "1.75rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,16,18,0.04), 0 8px 24px -16px rgba(16,16,18,0.18)",
        lift: "0 12px 40px -12px rgba(16, 16, 18, 0.28)",
        pop: "0 24px 80px -24px rgba(16, 16, 18, 0.45)",
      },
      maxWidth: {
        page: "72rem",
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
    },
  },
  plugins: [],
};

export default config;
