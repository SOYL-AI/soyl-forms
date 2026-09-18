"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CancelButton({ hasSubscription }: { hasSubscription: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!hasSubscription) return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (!window.confirm("Cancel your subscription? Your data stays; limits return to Free.")) {
            return;
          }
          setBusy(true);
          setMessage(null);
          fetch("/api/billing/cancel", { method: "POST" })
            .then(async (res) => {
              const data = (await res.json()) as { ok?: boolean; error?: string };
              if (!res.ok || !data.ok) throw new Error(data.error ?? "Cancel failed.");
              setMessage("Cancellation requested — the provider confirmation finalizes it.");
              router.refresh();
            })
            .catch((e: Error) => setMessage(e.message))
            .finally(() => setBusy(false));
        }}
        className="rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold hover:border-ink/30 disabled:opacity-60"
      >
        {busy ? "Working…" : "Cancel subscription"}
      </button>
      {message && <span className="text-xs text-ink-soft">{message}</span>}
    </span>
  );
}
