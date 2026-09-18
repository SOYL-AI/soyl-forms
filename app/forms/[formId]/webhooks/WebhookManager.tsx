"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createWebhook,
  deleteWebhook,
  setWebhookActive,
  testWebhook,
  type WebhookSummary,
} from "@/lib/forms/actions";

export function WebhookManager({
  formId,
  initial,
}: {
  formId: string;
  initial: WebhookSummary[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [onceSecret, setOnceSecret] = useState<{ id: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  return (
    <div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setOnceSecret(null);
          start(async () => {
            const res = await createWebhook({ formId, url });
            if (!res.ok) {
              setError(res.error);
              return;
            }
            setOnceSecret({ id: res.id, secret: res.secret });
            setUrl("");
            router.refresh();
          });
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-server.example.com/hooks/forms"
          aria-label="Webhook endpoint URL"
          className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
        />
        <button
          type="submit"
          disabled={pending || !url.trim()}
          className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          Add webhook
        </button>
      </form>

      {onceSecret && (
        <div role="alert" className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">
            Copy this secret now — it won&apos;t be shown again.
          </p>
          <p className="mt-1 break-all font-mono text-xs text-amber-900">{onceSecret.secret}</p>
          <p className="mt-2 text-xs text-amber-900/80">
            Verify deliveries with HMAC-SHA256 over <code>timestamp.body</code>;
            signature arrives in <code>x-signature-256</code>.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>
      )}

      {initial.length === 0 ? (
        <p className="mt-6 text-sm text-ink-soft">
          No webhooks yet. Completed submissions will POST a signed{" "}
          <code>form.submission.completed</code> event to each active endpoint,
          with bounded retries on failure.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white">
          {initial.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate font-mono text-sm">
                  {w.url}
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 font-sans text-[11px] font-semibold ${
                      w.is_active ? "bg-brand-50 text-brand-700" : "bg-ink/5 text-ink-faint"
                    }`}
                  >
                    {w.is_active ? "Active" : "Paused"}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  Added {new Date(w.created_at).toLocaleDateString("en-IN")}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => testWebhook({ webhookId: w.id }))}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
                >
                  Send test
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => setWebhookActive({ webhookId: w.id, active: !w.is_active }))}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-ink/5 disabled:opacity-60"
                >
                  {w.is_active ? "Pause" : "Resume"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm("Delete this webhook? Deliveries stop immediately.")) {
                      run(() => deleteWebhook({ webhookId: w.id }));
                    }
                  }}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
