"use client";

import { useEffect, useMemo } from "react";
import type { Answers, FormSchemaV1, FormTheme } from "@/types/forms";
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
}: {
  slug: string;
  schema: FormSchemaV1;
  versionId: string;
  minimal?: boolean;
  theme?: FormTheme;
}) {
  const sessionId = useMemo(() => newId(), []);
  const idempotencyKey = useMemo(() => newId(), []);

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
  ): Promise<{ ok: boolean; error?: string }> {
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
          durationMs: Math.round(performance.now()),
        }),
      });
    } catch {
      return { ok: false };
    }
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: data?.error ?? "Couldn't save your response. Try again." };
  }

  return (
    <FormRenderer
      schema={schema}
      minimal={minimal}
      theme={theme}
      uploads={{ slug }}
      onBeforeComplete={submit}
    />
  );
}
