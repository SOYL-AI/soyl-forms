"use client";

import { useState } from "react";
import { publishForm } from "@/lib/forms/actions";

export function PublishButton({
  formId,
  onBeforePublish,
}: {
  formId: string;
  /** Flush in-flight builder edits first; return false to abort publishing. */
  onBeforePublish?: () => Promise<boolean>;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; version: number } | null>(null);
  const [copied, setCopied] = useState(false);

  async function onPublish() {
    setWorking(true);
    setError(null);
    if (onBeforePublish) {
      const flushed = await onBeforePublish();
      if (!flushed) {
        setWorking(false);
        return;
      }
    }
    const res = await publishForm({ formId });
    setWorking(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult({ url: res.url, version: res.version });
    setCopied(false);
  }

  async function onCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onPublish}
        disabled={working}
        className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
      >
        {working ? "Publishing…" : "Publish"}
      </button>
      {error && (
        <span role="alert" className="max-w-xs text-xs font-medium text-red-700">
          {error}
        </span>
      )}
      {result && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Form published"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setResult(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-2xl tracking-tight">You&apos;re live</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Version {result.version} is now answering at:
            </p>
            <div className="mt-4 flex items-center gap-2">
              <input
                readOnly
                value={result.url}
                aria-label="Public form URL"
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm"
              />
              <button
                type="button"
                onClick={onCopy}
                className="shrink-0 rounded-full bg-ink px-4 py-2.5 text-xs font-semibold text-white"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold hover:border-ink/30"
              >
                Open live ↗
              </a>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setResult(null)}
                className="rounded-full px-4 py-2 text-xs font-semibold text-ink-soft hover:bg-ink/5"
              >
                Back to builder
              </button>
            </div>
            <p className="mt-3 text-xs text-ink-faint">
              QR codes and embeds arrive in Phase 4.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
