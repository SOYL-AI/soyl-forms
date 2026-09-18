"use client";

import type { FormSettings, FormTheme } from "@/types/forms";
import { THEME_PRESETS } from "@/lib/forms/themes";

const inputCls =
  "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

export function DesignPanel({
  theme,
  settings,
  onThemePatch,
  onSettingsPatch,
}: {
  theme: FormTheme;
  settings: FormSettings;
  onThemePatch: (p: Partial<FormTheme>) => void;
  onSettingsPatch: (p: Partial<FormSettings>) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-faint">
          Theme presets
        </p>
        <div className="grid grid-cols-3 gap-2">
          {THEME_PRESETS.map((preset) => {
            const active = theme.accent === preset.theme.accent &&
              theme.background === preset.theme.background;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onThemePatch({ ...preset.theme })}
                aria-pressed={active}
                title={preset.name}
                className={`rounded-xl border p-2 text-left transition-all ${
                  active
                    ? "border-brand-700 ring-2 ring-brand-600/20"
                    : "border-ink/10 hover:border-ink/30"
                }`}
                style={{ backgroundColor: preset.theme.background }}
              >
                <span
                  className="block h-8 rounded-lg"
                  style={{ backgroundColor: preset.theme.accent }}
                  aria-hidden
                />
                <span
                  className="mt-1.5 block text-[11px] font-semibold"
                  style={{ color: preset.theme.text }}
                >
                  {preset.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Row label="Accent color">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={theme.accent ?? "#0E7C5B"}
            onChange={(e) => onThemePatch({ accent: e.target.value })}
            className="h-9 w-12 cursor-pointer rounded-lg border border-ink/15 bg-white p-1"
            aria-label="Custom accent color"
          />
          <span className="text-xs text-ink-faint">or pick any color</span>
        </div>
      </Row>

      <div className="grid grid-cols-2 gap-2">
        <Row label="Headings">
          <select
            value={theme.font ?? "serif"}
            onChange={(e) => onThemePatch({ font: e.target.value as "sans" | "serif" })}
            className={inputCls}
          >
            <option value="serif">Serif</option>
            <option value="sans">Sans</option>
          </select>
        </Row>
        <Row label="Buttons">
          <select
            value={theme.buttonStyle ?? "pill"}
            onChange={(e) => onThemePatch({ buttonStyle: e.target.value as "pill" | "rounded" })}
            className={inputCls}
          >
            <option value="pill">Pill</option>
            <option value="rounded">Rounded</option>
          </select>
        </Row>
      </div>

      <div className="border-t border-ink/10 pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-faint">
          Form behavior
        </p>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={settings.showProgress ?? true}
              onChange={(e) => onSettingsPatch({ showProgress: e.target.checked })}
              className="h-4 w-4 accent-emerald-700"
            />
            Show progress bar
          </label>
          <Row label="Response limit (blank = unlimited)">
            <input
              type="number"
              min={1}
              value={settings.submissionLimit ?? ""}
              placeholder="Unlimited"
              onChange={(e) =>
                onSettingsPatch({
                  submissionLimit: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className={inputCls}
            />
          </Row>
          <Row label="Close automatically at (optional)">
            <input
              type="datetime-local"
              value={settings.closeAt ? settings.closeAt.slice(0, 16) : ""}
              onChange={(e) =>
                onSettingsPatch({
                  closeAt: e.target.value === "" ? null : new Date(e.target.value).toISOString(),
                })
              }
              className={inputCls}
            />
          </Row>
          <Row label="Closed message">
            <textarea
              value={settings.closedMessage ?? ""}
              placeholder="This form is no longer accepting responses."
              onChange={(e) => onSettingsPatch({ closedMessage: e.target.value })}
              rows={2}
              maxLength={500}
              className={inputCls}
            />
          </Row>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={settings.collectQueryParams ?? true}
              onChange={(e) => onSettingsPatch({ collectQueryParams: e.target.checked })}
              className="h-4 w-4 accent-emerald-700"
            />
            Save URL parameters as hidden fields
          </label>
        </div>
      </div>
    </div>
  );
}
