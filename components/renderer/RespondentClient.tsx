"use client";

import { useEffect, useMemo, useState } from "react";
import type { Answers, FormSchemaV1, FormSettings, FormTheme } from "@/types/forms";
import { FormRenderer } from "@/components/renderer/FormRenderer";

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
    const hidden: Record<string, string> = {};
    params.forEach((value, key) => {
      if (key !== "src" && key !== "embed") hidden[key] = value;
    });
    let res: Response;
    try {
      res = await fetch(`/api/public/forms/${slug}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          formVersionId: versionId,
          idempotencyKey,
          answers,
          hiddenFields: hidden,
          sessionId,
          source: params.get("src") ?? undefined,
          durationMs: Math.max(0, Date.now() - startedAt),
        }),
      });
    } catch {
      return { ok: false };
    }
    if (res.ok) {
      try {
        window.localStorage.setItem(doneKey, new Date().toISOString());
      } catch {
        /* ignore */
      }
      const data = (await res.json().catch(() => null)) as { score?: { points: number; max: number } } | null;
      return { ok: true, score: data?.score };
    }
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: data?.error ?? "Couldn't save your response. Try again." };
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
    <FormRenderer
      schema={schema}
      minimal={minimal}
      theme={theme}
      settings={settings}
      uploads={{ slug }}
      onBeforeComplete={submit}
      persistKey={`soyl:f:${slug}:${versionId}`}
    />
  );
}
