"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import {
  connectProvider,
  disconnectProvider,
  getProviderStatus,
} from "@/lib/billing/connect-actions";

/**
 * Workspace Razorpay connection (creator's OWN keys — respondent money
 * flows straight to their account, never through the platform).
 */
export function PaymentsSection({ workspaceId }: { workspaceId: string }) {
  const [status, setStatus] = useState<{ connected: boolean; keyId: string | null; mode: "test" | "live" | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyId, setKeyId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await getProviderStatus(workspaceId);
    if (res.ok) {
      setStatus({ connected: res.connected, keyId: res.keyId, mode: res.mode });
      setError(null);
    } else {
      setError(res.error);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-ink-faint" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Payments</p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Connect your own Razorpay keys to charge in forms. Money goes straight to your Razorpay account — we never
        hold it. Only key IDs are ever shown; secrets are stored encrypted.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {status === null ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-faint">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : status.connected ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-positive-soft px-2.5 py-1 text-xs font-semibold text-positive">
            Connected{status.mode === "live" ? " · Live" : " · Test"}
          </span>
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink-soft">{status.keyId}</code>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm("Disconnect Razorpay? Published payment steps will stop working.")) return;
              setBusy(true);
              setError(null);
              try {
                const res = await disconnectProvider({ workspaceId });
                if (!res.ok) setError(res.error);
                else await load();
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-danger hover:bg-danger-soft disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <form
          className="mt-4 grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const res = await connectProvider({ workspaceId, keyId, keySecret: secret });
              if (!res.ok) setError(res.error);
              else {
                setKeyId("");
                setSecret("");
                await load();
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Key ID" hint="Starts with rzp_test_ or rzp_live_. Found in Razorpay Dashboard → Settings → API Keys.">
            <Input value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_test_…" maxLength={64} autoComplete="off" />
          </Field>
          <Field label="Key secret" hint="Verified once with a read-only call, then stored encrypted.">
            <Input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="••••••••"
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
          <div>
            <Button disabled={busy || keyId.trim() === "" || secret === ""}>
              {busy ? "Connecting…" : "Connect Razorpay"}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-ink-faint">
            Use test keys first — the badge above will say Test until you connect live keys.
          </p>
        </form>
      )}
    </Card>
  );
}
