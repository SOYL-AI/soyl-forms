"use client";

import { useEffect, useMemo, useState } from "react";
import type { Answers, FormSchemaV1, FormSettings, FormTheme } from "@/types/forms";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import { parsePrefillParams } from "@/lib/forms/prefill";
import { respondentSession, type RespondentSession } from "@/lib/forms/respondent-session";
import type { ResumeState } from "@/lib/forms/resume";
import { availableLocales, localizeSchema } from "@/lib/forms/i18n";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function RespondentClient({
  slug,
  schema,
  versionId,
  minimal,
  theme,
  settings,
  resume,
}: {
  resume?: ResumeState;
  slug: string;
  schema: FormSchemaV1;
  versionId: string;
  minimal?: boolean;
  theme?: FormTheme;
  settings?: FormSettings;
}) {
  const [identity, setIdentity] = useState<RespondentSession | null>(null);
  useEffect(() => {
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* Storage can be disabled. */ }
    const next = respondentSession(storage, slug, versionId, resume);
    const url = new URL(window.location.href);
    if (next.versionId !== versionId) {
      url.searchParams.set("v", next.versionId);
      window.location.replace(url.toString());
      return;
    }
    url.searchParams.set("v", versionId);
    window.history.replaceState(null, "", url);
    if (resume?.token) {
      try { storage?.setItem(`soyl:resume:${slug}`, resume.token); } catch { /* ignore */ }
    }
    setIdentity(next);
  }, [slug, versionId, resume]);
  const sessionId = identity?.sessionId;
  const idempotencyKey = identity?.idempotencyKey;
  const startedAt = identity?.startedAt ?? Date.now();
  const doneKey = `soyl:done:${slug}`;
  const [alreadyDone, setAlreadyDone] = useState(false);
  // URL prefill (?email=a@b.com) + hidden fields (?name=...): parsed once,
  // validated against the schema, seeded into the form when no saved session exists.
  const prefill = useMemo(() => {
    if (!identity || typeof window === "undefined") return { answers: {}, hidden: {} };
    const params: Record<string, string> = {};
    new URLSearchParams(window.location.search).forEach((value, key) => {
      params[key] = value;
    });
    return parsePrefillParams(schema, settings ?? {}, params);
  }, [schema, settings, identity]);

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
    () => ({ ...prefill.answers, ...(resume?.answers ?? {}) }),
    [prefill, resume],
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
    if (!sessionId) return;
    const params = new URLSearchParams(window.location.search);
    const source = params.get("src") ?? undefined;
    fetch(`/api/public/forms/${slug}/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, source, formVersionId: versionId }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, sessionId]);

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
    let resumeToken = resume?.token;
    try { resumeToken ??= window.sessionStorage.getItem(`soyl:resume:${slug}`) ?? undefined; } catch { /* ignore */ }
    const payload = JSON.stringify({
      formVersionId: versionId,
      idempotencyKey,
      answers,
      hiddenFields: hidden,
      sessionId,
      resumeToken,
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
      try {
        window.sessionStorage.removeItem(`soyl:identity:${slug}`);
        window.sessionStorage.removeItem(`soyl:resume:${slug}`);
      } catch { /* ignore */ }
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

  if (!identity || !sessionId || !idempotencyKey) return <p role="status" className="text-center">Loading your form?</p>;

  if (alreadyDone) {
    return (
      <div className="text-center">
        <h1 className="font-display text-3xl tracking-tight">You&apos;ve already responded</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed opacity-70">
          This form accepts one response per device.
        </p>

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
      initialResume={resume}
      tracking={{ slug, sessionId, versionId, idempotencyKey }}
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
