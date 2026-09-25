"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Webhook } from "lucide-react";
import { createWebhook, deleteWebhook, setWebhookActive, testWebhook, type WebhookSummary } from "@/lib/forms/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty";
import { formatDate } from "@/lib/utils";

export function WebhookManager({ formId, initial }: { formId: string; initial: WebhookSummary[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [onceSecret, setOnceSecret] = useState<{ id: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMessage?: string) {
    setError(null);
    setNotice(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else if (okMessage) setNotice(okMessage);
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
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-server.example.com/hooks/forms" aria-label="Webhook endpoint URL" className="min-w-0 flex-1 !py-3" />
        <Button type="submit" disabled={pending || !url.trim()}>
          Add webhook
        </Button>
      </form>

      {onceSecret && (
        <Notice tone="warn" title="Copy this secret now — it won’t be shown again." className="mt-4">
          <p className="break-all font-mono text-xs text-ink">{onceSecret.secret}</p>
          <p className="mt-2 text-xs">
            Verify deliveries with HMAC-SHA256 over <code>timestamp.body</code>; the signature arrives in <code>x-signature-256</code>, the timestamp in{" "}
            <code>x-webhook-timestamp</code>.
          </p>
        </Notice>
      )}
      {error && (
        <Notice tone="danger" className="mt-3">
          {error}
        </Notice>
      )}
      {notice && (
        <Notice tone="positive" className="mt-3">
          {notice}
        </Notice>
      )}

      {initial.length === 0 ? (
        <EmptyState className="mt-6" icon={<Webhook className="h-5 w-5" />} title="No webhooks yet" description="Add an https endpoint above. You’ll get a signing secret once; test deliveries are one click." />
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-paper">
          {initial.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate font-mono text-sm">
                  {w.url}
                  <Badge tone={w.is_active ? "positive" : "neutral"}>{w.is_active ? "Active" : "Paused"}</Badge>
                </p>
                <p className="mt-0.5 text-xs text-ink-faint">Added {formatDate(w.created_at)}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => testWebhook({ webhookId: w.id }), "Test delivery accepted by your endpoint.")}>
                  Send test
                </Button>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setWebhookActive({ webhookId: w.id, active: !w.is_active }))}>
                  {w.is_active ? "Pause" : "Resume"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  onClick={() => {
                    if (window.confirm("Delete this webhook? Deliveries stop immediately.")) run(() => deleteWebhook({ webhookId: w.id }));
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
