"use client";

import { useEffect, useMemo, useState } from "react";
import type { Answers, FormSchemaV1, FormSettings, FormTheme } from "@/types/forms";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import { parsePrefillParams } from "@/lib/forms/prefill";
import { availableLocales, localizeSchema } from "@/lib/forms/i18n";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function RespondentClient({
  slug,
  schema,
  versionId,
  minimal,
  theme,
  settings,
}: {
  slug: string;
  schema: FormSchemaV1;
  versionId: string;
  minimal?: boolean;
  theme?: FormTheme;
  settings?: FormSettings;
}) {
  const sessionId = useMemo(() => newId(), []);
  const idempotencyKey = useMemo(() => newId(), []);
  const startedAt = useMemo(() => Date.now(), []);
  const doneKey = `soyl:done:${slug}`;
  const [alreadyDone, setAlreadyDone] = useState(false);
  // URL prefill (?email=a@b.com) + hidden fields (?name=...): parsed once,
  // validated against the schema, seeded into the form when no saved session exists.
  const prefill = useMemo(() => {
    if (typeof window === "undefined") return { answers: {}, hidden: {} };
    const params: Record<string, string> = {};
    new URLSearchParams(window.location.search).forEach((value, key) => {
      params[key] = value;
    });
    return parsePrefillParams(schema, settings ?? {}, params);
  }, [schema, settings]);

  // Resume link (?resume=token): fetch saved answers once. Saved progress
  // wins over live URL-prefill values — saved progress wins.
  const [resumeAnswers, setResumeAnswers] = useState<Answers>({});
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = new URLSearchParams(window.location.search).get("resume");
    if (!token) return;
    fetch(`/api/public/forms/${slug}/resume?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const a = (d as { answers?: Answers } | null)?.answers;
        if (a && typeof a === "object") setResumeAnswers(a);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  // Multi-language: respondent picks once, remembered per form.
  const locales = useMemo(() => availableLocales(schema), [schema]);
  const [locale, setLocale] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || locales.length === 0) return;
    try {
      const saved = window.localStorage.getItem(`soyl:locale:${slug}`);
      if (saved && locales.includes(saved)) setLocale(saved);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  const localized = useMemo(() => localizeSchema(schema, locale), [schema, locale]);
  function chooseLocale(next: string | null) {
    setLocale(next);
    try {
      if (next) window.localStorage.setItem(`soyl:locale:${slug}`, next);
      else window.localStorage.removeItem(`soyl:locale:${slug}`);
    } catch {
      /* ignore */
    }
  }

  const initialAnswers = useMemo(
    () => ({ ...prefill.answers, ...resumeAnswers }),
    [prefill, resumeAnswers],
  );


  // Soft duplicate guard (per device) when the creator turned repeats off.
  useEffect(() => {
    if (settings?.allowMultipleSubmissions === false) {
      try {
        if (window.localStorage.getItem(doneKey)) setAlreadyDone(true);
      } catch {
        /* ignore */
      }
    }
  }, [settings?.allowMultipleSubmissions, doneKey]);

  // Record the visit once (analytics; failure never blocks answering).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("src") ?? undefined;
    fetch(`/api/public/forms/${slug}/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, source }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function submit(
    answers: Answers,
  ): Promise<{ ok: boolean; error?: string; score?: { points: number; max: number } }> {
    const params = new URLSearchParams(window.location.search);
    // Re-parse at submit time so late-added params are included; invalid or
    // over-long values are dropped by the parser, never stored.
    const live: Record<string, string> = {};
    params.forEach((value, key) => {
      live[key] = value;
    });
    const hidden = { ...prefill.hidden, ...parsePrefillParams(schema, settings ?? {}, live).hidden };
    const payload = JSON.stringify({
      formVersionId: versionId,
      idempotencyKey,
      answers,
      hiddenFields: hidden,
      sessionId,
      source: params.get("src") ?? undefined,
      durationMs: Math.max(0, Date.now() - startedAt),
    });

    // Retry network failures, server errors and rate limits a few times. The
    // idempotency key makes a retried submission land exactly once.
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(attempt * 1500);
      try {
        res = await fetch(`/api/public/forms/${slug}/submit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
        });
      } catch {
        res = null;
        continue;
      }
      if (res.ok || (res.status < 500 && res.status !== 429)) break;
    }

    if (!res) {
      return { ok: false, error: "You seem to be offline. Check your connection and try again — your answers are kept." };
    }
    if (res.ok) {
      // Saved progress is spent: the resume link must not replay a submitted form.
      fetch(`/api/public/forms/${slug}/resume`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
      try {
        window.localStorage.setItem(doneKey, new Date().toISOString());
      } catch {
        /* ignore */
      }
      const data = (await res.json().catch(() => null)) as { score?: { points: number; max: number } } | null;
      return { ok: true, score: data?.score };
    }
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: data?.error ?? "We couldn't save your response. Please try again — your answers are kept." };
  }

  if (alreadyDone) {
    return (
      <div className="text-center">
        <h1 className="font-display text-3xl tracking-tight">You&apos;ve already responded</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed opacity-70">
          This form accepts one response per device.
        </p>
        <button
          type="button"
          onClick={() => setAlreadyDone(false)}
          className="mt-6 rounded-full border px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ borderColor: "color-mix(in srgb, currentColor 30%, transparent)" }}
        >
          Respond again
        </button>
      </div>
    );
  }

  return (
    <div>
      {locales.length > 0 && (
        <div className="mb-4 flex flex-wrap justify-end gap-1.5" role="group" aria-label="Language">
          <LocaleButton active={locale === null} onClick={() => chooseLocale(null)} label="Default" />
          {locales.map((l) => (
            <LocaleButton key={l} active={locale === l} onClick={() => chooseLocale(l)} label={l} />
          ))}
        </div>
      )}
    <FormRenderer
      schema={localized}
      minimal={minimal}
      theme={theme}
      settings={settings}
      uploads={{ slug }}
      onBeforeComplete={submit}
      persistKey={`soyl:f:${slug}:${versionId}`}
      initialAnswers={initialAnswers}
      tracking={{ slug, sessionId, versionId }}
      persistPrefix={`soyl:f:${slug}:`}
    />
    </div>
  );
}

function LocaleButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={active ? "f-btn-primary px-3 py-1 text-xs" : "f-btn-secondary px-3 py-1 text-xs"}
    >
      {label}
    </button>
  );
}
