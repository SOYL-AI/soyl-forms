"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createForm,
  duplicateForm,
  renameForm,
  setFormArchived,
} from "@/lib/forms/actions";
import { useQrScanner, QrScanResult } from "@/components/QrScanner";

export function ScanQrButton() {
  const { scanning, result, error, isNative, startScan, clearResult } =
    useQrScanner();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Only show on native platform (Capacitor Android)
    import("@capacitor/core")
      .then(({ Capacitor }) => setReady(Capacitor.isNativePlatform()))
      .catch(() => setReady(false));
  }, []);

  if (!ready) return null;

  return (
    <>
      <button
        type="button"
        onClick={startScan}
        disabled={scanning}
        className="rounded-full border border-ink/15 bg-white px-5 py-2.5 text-sm font-semibold transition-colors hover:border-ink/30 disabled:opacity-60"
        aria-label="Scan QR code"
      >
        {scanning ? "Scanning…" : "📷 Scan QR"}
      </button>
      {error && (
        <p role="alert" className="w-full text-xs font-medium text-red-700">
          {error}
        </p>
      )}
      {result && result.type === "display" && (
        <QrScanResult value={result.value} onClose={clearResult} />
      )}
    </>
  );
}

export function NewFormButton() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white"
      >
        + New form
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await createForm({ title: name });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          router.push(`/builder/${res.id}`);
        });
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Form name, e.g. Event signup"
        aria-label="New form name"
        className="w-56 rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create"}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm font-medium text-red-700">{error}</p>
      )}
    </form>
  );
}

export function FormRowActions({
  id,
  title,
  archived,
}: {
  id: string;
  title: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else {
        setRenaming(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/builder/${id}`}
        className="rounded-full border border-ink/15 bg-white px-4 py-1.5 text-xs font-semibold transition-colors hover:border-ink/30"
      >
        Open builder
      </Link>
      {renaming ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => renameForm({ formId: id, title: name }));
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Form name"
            className="w-40 rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
          />
          <button type="submit" disabled={pending} className="text-xs font-semibold text-brand-700">
            Save
          </button>
          <button type="button" onClick={() => { setRenaming(false); setName(title); }} className="text-xs text-ink-faint">
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setRenaming(true)}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-ink/5"
        >
          Rename
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(async () => {
            const res = await duplicateForm({ formId: id });
            if (res.ok) router.push(`/builder/${res.id}`);
            return res;
          })
        }
        className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-ink/5 disabled:opacity-60"
      >
        Duplicate
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            archived ||
            window.confirm(`Archive "${title}"? You can restore it later.`)
          ) {
            run(() => setFormArchived({ formId: id, archived: !archived }));
          }
        }}
        className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-ink/5 disabled:opacity-60"
      >
        {archived ? "Restore" : "Archive"}
      </button>
      {error && (
        <p role="alert" className="w-full text-xs font-medium text-red-700">{error}</p>
      )}
    </div>
  );
}
